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

  const { prenom, courriel, date, heure, service, duree } = body;

  if (!prenom || !courriel || !date || !heure) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Champs manquants' }) };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // Courriel à Isabelle — notification d'annulation
    await transporter.sendMail({
      from: `"Kinésia Relief — Système de réservation" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `⚠️ Demande d'annulation — ${prenom} — ${date} à ${heure}`,
      html: `
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="UTF-8" /></head>
        <body style="font-family: Arial, sans-serif; background: #f5f5f0; margin: 0; padding: 32px;">
          <div style="max-width: 540px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: #c0392b; padding: 28px 36px; text-align: center;">
              <h1 style="color: #fff; font-size: 1.3rem; margin: 0;">Demande d'annulation reçue</h1>
            </div>
            <div style="padding: 32px 36px;">
              <p style="color: #333; line-height: 1.6; margin: 0 0 20px;">Un client a demandé l'annulation de son rendez-vous :</p>
              <div style="background: #fff5f5; border-left: 4px solid #c0392b; border-radius: 8px; padding: 18px 22px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; color: #1a1a1a;"><strong>👤 Nom :</strong> ${prenom}</p>
                <p style="margin: 0 0 8px; color: #1a1a1a;"><strong>📅 Date :</strong> ${date}</p>
                <p style="margin: 0 0 8px; color: #1a1a1a;"><strong>🕐 Heure :</strong> ${heure}</p>
                ${service ? `<p style="margin: 0 0 8px; color: #1a1a1a;"><strong>🤲 Soin :</strong> ${service}</p>` : ''}
                ${duree ? `<p style="margin: 0; color: #1a1a1a;"><strong>⏱️ Durée :</strong> ${duree} min</p>` : ''}
              </div>
              <p style="color: #555; margin: 0 0 8px;">Courriel du client : <a href="mailto:${courriel}" style="color: #2A5446;">${courriel}</a></p>
              <p style="color: #888; font-size: 0.85rem; margin: 0;">N'oubliez pas de retirer le rendez-vous de votre calendrier Google si vous confirmez l'annulation.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    // Courriel au client — accusé de réception
    await transporter.sendMail({
      from: `"Kinésia Relief — Isabelle Bureau" <${process.env.GMAIL_USER}>`,
      to: courriel,
      subject: `Demande d'annulation reçue — Kinésia Relief`,
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
              <h2 style="color: #1A2E25; font-size: 1.2rem; margin: 0 0 16px;">Bonjour ${prenom},</h2>
              <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 20px;">
                Votre demande d'annulation a bien été reçue pour le rendez-vous suivant :
              </p>
              <div style="background: #f0f7f4; border-left: 4px solid #2A5446; border-radius: 8px; padding: 18px 22px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; color: #1A2E25;"><strong>📅 Date :</strong> ${date}</p>
                <p style="margin: 0; color: #1A2E25;"><strong>🕐 Heure :</strong> ${heure}</p>
              </div>
              <div style="background: #fff8ed; border-left: 4px solid #B8922A; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px;">
                <p style="margin: 0; color: #7A5A1A; font-size: 0.9rem; line-height: 1.55;">
                  ⚠️ <strong>Rappel :</strong> Les annulations doivent être effectuées au moins <strong>24 heures à l'avance</strong>. Passé ce délai, la séance est considérée comme effectuée.
                </p>
              </div>
              <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 8px;">
                Isabelle vous contactera pour confirmer l'annulation. Pour toute urgence :
              </p>
              <p style="margin: 0 0 28px;">
                <a href="mailto:${process.env.GMAIL_USER}" style="color: #2A5446; font-weight: 600;">${process.env.GMAIL_USER}</a>
                &nbsp;·&nbsp; Texto : <strong>438-939-8359</strong>
              </p>
              <p style="color: #3A5E50; line-height: 1.65; margin: 0;">
                Cordialement,<br />
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

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Erreur envoi courriel annulation:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Erreur lors de l\'envoi' }),
    };
  }
};
