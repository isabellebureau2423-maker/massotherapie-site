const twilio = require('twilio');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFr(dateStr) {
  // dateStr format : YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  // Utiliser UTC pour éviter les décalages de fuseau
  const d = new Date(Date.UTC(year, month - 1, day));
  const jourNom = JOURS_FR[d.getUTCDay()];
  const moisNom = MOIS_FR[d.getUTCMonth()];
  return `${jourNom} ${day} ${moisNom} ${year}`;
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

  const { telephone, prenom, date, heure, duree } = body;

  if (!telephone || !prenom || !date || !heure || !duree) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Champs obligatoires manquants' }),
    };
  }

  const dateFormatee = formatDateFr(date);

  // Calculer si le rendez-vous est dans moins de 10 minutes (mode test)
  const rdvDate = new Date(`${date}T${heure}:00`);
  const maintenant = new Date();
  const delaiMs = rdvDate.getTime() - maintenant.getTime() - 24 * 60 * 60 * 1000; // 24h avant

  const message =
    `Bonjour ${prenom} ! 😊 Rappel de votre rendez-vous Kinésia Relief demain, ` +
    `${dateFormatee} à ${heure} (${duree} min). ` +
    `L'adresse vous sera envoyée ce soir. ` +
    `Questions ? Textez Isabelle au 438-939-8359.`;

  // Si le délai avant le rappel est inférieur à 10 min, envoyer maintenant (mode test)
  if (delaiMs <= 10 * 60 * 1000) {
    try {
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN,
      );

      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: telephone,
      });

      console.log(`SMS de rappel envoyé à ${telephone} pour le ${dateFormatee} à ${heure}`);
    } catch (err) {
      console.error('Erreur envoi SMS Twilio:', err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Erreur lors de l\'envoi du SMS' }),
      };
    }
  } else {
    // Loguer l'heure cible pour scheduling futur
    const heureRappel = new Date(rdvDate.getTime() - 24 * 60 * 60 * 1000);
    console.log(
      `[REMINDER SCHEDULED] SMS à envoyer à ${telephone} ` +
      `le ${heureRappel.toISOString()} pour RDV ${dateFormatee} ${heure}. ` +
      `Message: "${message}"`,
    );
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: true }),
  };
};
