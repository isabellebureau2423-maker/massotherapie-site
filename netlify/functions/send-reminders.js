const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const TZ = 'America/Toronto';

exports.handler = async () => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  let events = [];
  try {
    const res = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      singleEvents: true,
      privateExtendedProperty: 'reminded=false',
    });
    events = res.data.items || [];
  } catch (err) {
    console.error('Erreur lecture calendrier:', err);
    return { statusCode: 500, body: 'Erreur calendrier' };
  }

  if (events.length === 0) {
    console.log('Aucun rappel à envoyer.');
    return { statusCode: 200, body: 'OK' };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  for (const event of events) {
    const props = event.extendedProperties?.private || {};
    const clientEmail  = props.clientEmail;
    const clientPrenom = props.clientPrenom || '';
    const clientDuree  = props.clientDuree  || '60';

    if (!clientEmail) continue;

    const startUTC = new Date(event.start.dateTime || event.start.date);

    const dateFormatted = startUTC.toLocaleDateString('fr-CA', {
      timeZone: TZ,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const heureFormatted = startUTC.toLocaleTimeString('fr-CA', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    });

    const heureFinUTC = new Date(startUTC.getTime() + Number(clientDuree) * 60 * 1000);
    const heureFinFormatted = heureFinUTC.toLocaleTimeString('fr-CA', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    });

    try {
      await transporter.sendMail({
        from: `"Kinésia Relief — Isabelle Bureau" <${process.env.GMAIL_USER}>`,
        to: clientEmail,
        subject: 'Rappel — Votre rendez-vous demain chez Kinésia Relief',
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
                <h2 style="color: #1A2E25; font-size: 1.2rem; margin: 0 0 20px;">Bonjour ${clientPrenom},</h2>
                <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 24px;">
                  Votre rendez-vous chez Kinésia Relief est <strong>demain</strong>. Voici un rappel de votre séance :
                </p>
                <div style="background: #f0f7f4; border-left: 4px solid #2A5446; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
                  <p style="margin: 0 0 8px; color: #1A2E25;"><strong>📅 Date :</strong> ${dateFormatted}</p>
                  <p style="margin: 0 0 8px; color: #1A2E25;"><strong>🕐 Heure :</strong> ${heureFormatted} – ${heureFinFormatted}</p>
                  <p style="margin: 0; color: #1A2E25;"><strong>⏱️ Durée :</strong> ${clientDuree} minutes</p>
                </div>
                <div style="background: #fff8ed; border-left: 4px solid #B8922A; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
                  <p style="margin: 0; color: #7A5A1A; font-size: 0.9rem;">
                    📍 <strong>Adresse :</strong> 1030 rue Saint-Paul, appartement 102, Saint-Rémi
                  </p>
                </div>
                <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 8px;">
                  En cas d'empêchement, contactez-moi le plus tôt possible :
                </p>
                <p style="margin: 0 0 28px;">
                  Texto : <strong>438-939-8359</strong>
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

      console.log(`Rappel envoyé à ${clientEmail} pour ${dateFormatted} ${heureFormatted}`);

      // Marquer l'événement comme rappelé
      await calendar.events.patch({
        calendarId: process.env.GOOGLE_CALENDAR_ID,
        eventId: event.id,
        requestBody: {
          extendedProperties: {
            private: { ...props, reminded: 'true' },
          },
        },
      });

    } catch (err) {
      console.error(`Erreur rappel pour ${clientEmail}:`, err);
    }
  }

  return { statusCode: 200, body: 'OK' };
};
