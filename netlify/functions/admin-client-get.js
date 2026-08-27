const crypto = require('crypto');
const { getStore } = require('./_blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  const { token, key } = event.queryStringParameters || {};
  if (!verifyToken(token)) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Non autorisé' }) };
  if (!key) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Paramètre key requis' }) };

  try {
    const store = getStore('kinesia-clients');
    const data = await store.get(key, { type: 'json' });
    if (!data) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Client introuvable' }) };
    const { intakeToken, ...safe } = data;
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(safe) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};
