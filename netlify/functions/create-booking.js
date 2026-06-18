const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

  if (!prenom || !nom || !courriel || !duree || !date || !heure) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Champs obligatoires manquants' }),
    };
  }

  // Construire les dates ISO
  const startDateTime = new Date(`${date}T${heure}:00`);
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
        summary: `Kinésia Relief — ${prenom} ${nom} (${duree} min)`,
        description: `Téléphone: ${telephone || 'non fourni'}\nCourriel: ${courriel}\nDurée: ${duree} min`,
        start: { dateTime: startDateTime.toISOString() },
        end: { dateTime: endDateTime.toISOString() },
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

    const dateFormatted = new Date(`${date}T${heure}:00`).toLocaleDateString('fr-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const heureFormatted = heure;
    const heureFinDate = new Date(startDateTime.getTime() + Number(duree) * 60 * 1000);
    const heureFinFormatted = heureFinDate.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });

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
                  📍 <strong>Important :</strong> L'adresse de la clinique vous sera communiquée par texto avant votre rendez-vous.
                </p>
              </div>
              <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 8px;">
                Pour toute question ou modification, n'hésitez pas à me contacter :
              </p>
              <p style="margin: 0 0 28px;">
                <a href="mailto:${process.env.GMAIL_USER}" style="color: #2A5446; font-weight: 600;">${process.env.GMAIL_USER}</a>
                &nbsp;·&nbsp; Texto : <strong>438-939-8359</strong>
              </p>
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
