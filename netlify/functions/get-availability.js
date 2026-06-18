const { google } = require('googleapis');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const TZ = 'America/Toronto';

// Retourne l'offset UTC→Toronto en minutes à partir d'un moment UTC donné (ex: -240 pour EDT)
function getTorontoOffsetMinutes(utcDate) {
  const utcH = utcDate.getUTCHours();
  const utcM = utcDate.getUTCMinutes();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);

  let torH = parseInt(parts.find(p => p.type === 'hour').value);
  const torM = parseInt(parts.find(p => p.type === 'minute').value);
  if (torH === 24) torH = 0;

  let offset = (torH * 60 + torM) - (utcH * 60 + utcM);
  if (offset > 12 * 60) offset -= 24 * 60;
  if (offset < -12 * 60) offset += 24 * 60;
  return offset;
}

// Convertit une heure locale Toronto (dateStr YYYY-MM-DD + hhmm HH:MM) en Date UTC
function torontoToUTC(dateStr, hhmm) {
  // On utilise midi UTC comme référence pour trouver l'offset DST de la journée
  const noonUTC = new Date(`${dateStr}T12:00:00Z`);
  const offsetMin = getTorontoOffsetMinutes(noonUTC);

  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);

  const utcTotalMin = h * 60 + m - offsetMin;
  return new Date(Date.UTC(y, mo - 1, d, Math.floor(utcTotalMin / 60), utcTotalMin % 60, 0));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const { date, duree } = event.queryStringParameters || {};

  if (!date || !duree) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Paramètres date et duree requis' }),
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Format de date invalide (attendu YYYY-MM-DD)' }),
    };
  }

  const durationMin = parseInt(duree, 10);
  if (![60, 90].includes(durationMin)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'duree doit être 60 ou 90' }),
    };
  }

  const totalBlockMin = durationMin + 30; // séance + tampon

  // Auth Google Calendar via Service Account (lecture seule)
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // Récupérer tous les événements de la journée en heure Toronto
  const dayStart = torontoToUTC(date, '00:00');
  const dayEnd = torontoToUTC(date, '23:59');
  dayEnd.setSeconds(59);

  let events = [];
  try {
    const res = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    events = (res.data.items || [])
      .filter(e => e.start?.dateTime) // exclure les événements toute la journée
      .map(e => ({
        start: new Date(e.start.dateTime),
        end: new Date(e.end.dateTime),
      }));
  } catch (err) {
    console.error('Erreur Google Calendar:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Erreur lors de la récupération du calendrier' }),
    };
  }

  // Limite de fin de journée : 20h00 Toronto en UTC
  const cutoffUTC = torontoToUTC(date, '20:00');

  // Générer les créneaux de 08h00 à 19h30 par tranches de 30 min
  const slots = [];

  for (let minOfDay = 8 * 60; minOfDay < 20 * 60; minOfDay += 30) {
    const hh = String(Math.floor(minOfDay / 60)).padStart(2, '0');
    const mm = String(minOfDay % 60).padStart(2, '0');
    const slotTime = `${hh}:${mm}`;

    const slotStart = torontoToUTC(date, slotTime);
    const slotEnd = new Date(slotStart.getTime() + totalBlockMin * 60 * 1000);

    // Créneau invalide si le bloc dépasse 20h00
    if (slotEnd > cutoffUTC) {
      slots.push({ time: slotTime, available: false });
      continue;
    }

    // Vérifier le chevauchement avec les événements existants
    const hasConflict = events.some(e => e.start < slotEnd && e.end > slotStart);

    slots.push({ time: slotTime, available: !hasConflict });
  }

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slots }),
  };
};
