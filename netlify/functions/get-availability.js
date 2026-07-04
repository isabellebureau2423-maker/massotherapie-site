const { google } = require('googleapis');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const TZ = 'America/Toronto';

function getTorontoOffsetMinutes(utcDate) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);

  const utcH = utcDate.getUTCHours();
  const utcM = utcDate.getUTCMinutes();
  let torH = parseInt(parts.find(p => p.type === 'hour').value);
  const torM = parseInt(parts.find(p => p.type === 'minute').value);
  if (torH === 24) torH = 0;

  let offset = (torH * 60 + torM) - (utcH * 60 + utcM);
  if (offset > 12 * 60) offset -= 24 * 60;
  if (offset < -12 * 60) offset += 24 * 60;
  return offset;
}

function torontoToUTC(dateStr, hhmm) {
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
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Paramètres date et duree requis' }) };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Format de date invalide (attendu YYYY-MM-DD)' }) };
  }

  const durationMin = parseInt(duree, 10);
  if (![60, 90].includes(durationMin)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'duree doit être 60 ou 90' }) };
  }

  const totalBlockMin = durationMin + 30;

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // Horaire selon le jour
  const dow = new Date(date + 'T12:00:00Z').getDay();
  const isWeekend = dow === 0 || dow === 6;
  const startHour = isWeekend ? 9 : 8;
  const endHour   = isWeekend ? 16 : 17;

  const cutoffUTC = torontoToUTC(date, `${String(endHour).padStart(2,'0')}:00`);

  // Construire la liste des créneaux avec leurs plages UTC
  const slotRanges = [];
  for (let minOfDay = startHour * 60; minOfDay < endHour * 60; minOfDay += 30) {
    const hh = String(Math.floor(minOfDay / 60)).padStart(2, '0');
    const mm = String(minOfDay % 60).padStart(2, '0');
    const slotTime = `${hh}:${mm}`;
    const slotStart = torontoToUTC(date, slotTime);
    const slotEnd   = new Date(slotStart.getTime() + totalBlockMin * 60 * 1000);
    slotRanges.push({ time: slotTime, slotStart, slotEnd });
  }

  // Une seule requête freebusy pour toute la journée
  const dayStart = torontoToUTC(date, `${String(startHour).padStart(2,'0')}:00`);
  const dayEnd   = cutoffUTC;

  let busyRanges = [];
  try {
    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
      },
    });
    busyRanges = (fb.data.calendars[process.env.GOOGLE_CALENDAR_ID]?.busy ?? []).map(b => ({
      start: new Date(b.start),
      end:   new Date(b.end),
    }));
  } catch (err) {
    console.error('Erreur freebusy:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Erreur lors de la récupération du calendrier' }) };
  }

  const slots = slotRanges.map(({ time, slotStart, slotEnd }) => {
    if (slotEnd > cutoffUTC) return { time, available: false };
    const busy = busyRanges.some(b => b.start < slotEnd && b.end > slotStart);
    return { time, available: !busy };
  });

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ slots }),
  };
};
