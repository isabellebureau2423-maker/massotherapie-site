const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TZ = 'America/Toronto';

// Retourne l'offset UTC→Toronto en minutes (ex: -240 pour EDT)
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

// Convertit une heure locale Toronto (YYYY-MM-DD + HH:MM) en Date UTC
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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Corps JSON invalide' }) };
  }

  const { prenom, nom, telephone, courriel, duree, date, heure } = body;

  if (!prenom || !courriel || !duree || !date || !heure) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Champs obligatoires manquants' }),
    };
  }

  // Convertir l'heure Toronto → UTC correctement
  const startDateTime = torontoToUTC(date, heure);
  const endDateTime = new Date(startDateTime.getTime() + (Number(duree) + 30) * 60 * 1000);

  // Auth Google Calendar via Service Account
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // Vérifier si le créneau est libre
  try {
    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDateTime.toISOString(),
        timeMax: endDateTime.toISOString(),
        items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
      },
    });

    const busy = freeBusy.data.calendars[process.env.GOOGLE_CALENDAR_ID]?.busy ?? [];
    if (busy.length > 0) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ available: false, error: 'Ce créneau n\'est plus disponible' }),
      };
    }
  } catch (err) {
    console.error('Erreur freebusy:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Erreur lors de la vérification du calendrier' }),
    };
  }

  // Créer l'événement Google Calendar
  try {
    await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: `Kinésia Relief — ${prenom} ${nom || ''} (${duree} min)`,
        description: `Téléphone: ${telephone || 'non fourni'}\nCourriel: ${courriel}\nDurée: ${duree} min`,
        start: { dateTime: startDateTime.toISOString(), timeZone: TZ },
        end: { dateTime: endDateTime.toISOString(), timeZone: TZ },
        colorId: '2',
      },
    });
  } catch (err) {
    console.error('Erreur création événement:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Erreur lors de la création du rendez-vous' }),
    };
  }

  // Envoyer le courriel de confirmation
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const dateFormatted = new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-CA', {
      timeZone: TZ,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const heureFormatted = heure;
    const heureFinUTC = new Date(startDateTime.getTime() + Number(duree) * 60 * 1000);
    const heureFinFormatted = heureFinUTC.toLocaleTimeString('fr-CA', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    });

    await transporter.sendMail({
      from: `"Kinésia Relief — Isabelle Bureau" <${process.env.GMAIL_USER}>`,
      to: courriel,
      subject: 'Confirmation de votre rendez-vous — Kinésia Relief',
      html: `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8" /></head>
        <body style="font-family: 'Inter', Arial, sans-serif; background: #f5f5f0; margin: 0; padding: 32px;">
          <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #1A1A18, #2A5446); padding: 36px 40px; text-align: center;">
              <h1 style="font-family: Georgia, serif; color: #D4AF5A; font-size: 1.6rem; margin: 0 0 6px;">Kinésia Relief</h1>
              <p style="color: rgba(255,255,255,0.65); font-size: 0.85rem; margin: 0;">Isabelle Bureau Mistral · Massothérapeute</p>
            </div>
            <div style="padding: 36px 40px;">
              <h2 style="color: #1A2E25; font-size: 1.2rem; margin: 0 0 20px;">Bonjour ${prenom},</h2>
              <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 24px;">
                Votre rendez-vous est confirmé. Voici le récapitulatif de votre séance :
              </p>
              <div style="background: #f0f7f4; border-left: 4px solid #2A5446; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; color: #1A2E25;"><strong>📅 Date :</strong> ${dateFormatted}</p>
                <p style="margin: 0 0 8px; color: #1A2E25;"><strong>🕐 Heure :</strong> ${heureFormatted} – ${heureFinFormatted}</p>
                <p style="margin: 0; color: #1A2E25;"><strong>⏱️ Durée :</strong> ${duree} minutes</p>
              </div>
              <div style="background: #fff8ed; border-left: 4px solid #B8922A; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px;">
                <p style="margin: 0; color: #7A5A1A; font-size: 0.9rem;">
                  📍 <strong>Adresse :</strong> 1030 rue Saint-Paul, appartement 102, Saint-Rémi
                </p>
              </div>
              <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 8px;">
                Pour toute question ou modification, n'hésitez pas à me contacter :
              </p>
              <p style="margin: 0 0 28px;">
                Texto : <strong>438-939-8359</strong>
              </p>
              <div style="background: #f9f6ee; border: 1px solid #e8d9a0; border-radius: 10px; padding: 20px 24px; margin-bottom: 28px; text-align: center;">
                <p style="margin: 0 0 6px; color: #1A2E25; font-weight: 600; font-size: 1rem;">⭐ Après votre séance…</p>
                <p style="margin: 0 0 16px; color: #5A4A1A; font-size: 0.88rem; line-height: 1.5;">Si vous avez aimé votre expérience, un avis Google m'aide énormément à faire connaître Kinésia Relief. Merci du fond du cœur !</p>
                <a href="https://share.google/JAIxut0FPTkd6aZoL" style="display: inline-block; background: #D4AF5A; color: #1A1A18; font-weight: 700; font-size: 0.9rem; text-decoration: none; padding: 12px 28px; border-radius: 100px;">Laisser un avis 5 étoiles</a>
              </div>
              <p style="color: #3A5E50; line-height: 1.65; margin: 0;">
                Au plaisir de vous accueillir,<br />
                <strong style="color: #1A2E25;">Isabelle Bureau Mistral</strong><br />
                <span style="color: #7AAF98; font-size: 0.875rem;">Massothérapeute · Kinésithérapeute sportive · Saint-Rémi</span>
              </p>
            </div>
            <div style="background: #1A1A18; padding: 16px 40px; text-align: center;">
              <p style="color: rgba(255,255,255,0.35); font-size: 0.75rem; margin: 0;">© 2025 Kinésia Relief · Saint-Rémi, Québec</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
  } catch (err) {
    console.error('Erreur envoi courriel:', err);
    // On ne bloque pas la réponse si le courriel échoue — le RDV est déjà créé
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: true }),
  };
};
