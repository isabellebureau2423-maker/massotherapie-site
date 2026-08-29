const crypto = require('crypto');
const { getStore } = require('./_blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function verifyToken(token) {
  if (!token) return false;
  try {
    const [exp, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD).update(exp).digest('hex');
    return sig === expected && Date.now() < parseInt(exp, 10);
  } catch { return false; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: '' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON invalide' }) }; }

  const { token, prenom, nom, courriel, telephone } = body;
  if (!verifyToken(token)) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Non autorisé' }) };
  if (!prenom || !courriel) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Prénom et courriel obligatoires' }) };

  try {
    const store = getStore('kinesia-clients');
    const clientKey = courriel.toLowerCase().trim();
    const existing = await store.get(clientKey, { type: 'json' });
    if (existing) return { statusCode: 409, headers: CORS, body: JSON.stringify({ error: 'Un client avec ce courriel existe déjà' }) };

    const intakeToken = crypto.randomBytes(20).toString('hex');
    await store.setJSON(clientKey, {
      prenom: prenom.trim(),
      nom: (nom || '').trim(),
      courriel: courriel.toLowerCase().trim(),
      telephone: (telephone || '').trim(),
      dateNaissance: '',
      allergies: '',
      conditionsMedicales: '',
      medicaments: '',
      contreIndications: '',
      blessures: '',
      autresInfos: '',
      notes: [],
      appointments: [],
      intakeToken,
      intakeCompleted: false,
      createdAt: new Date().toISOString(),
    });

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, key: clientKey }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};
