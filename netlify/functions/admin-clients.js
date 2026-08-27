const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

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
  if (!verifyToken((event.queryStringParameters || {}).token)) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Non autorisé' }) };
  }

  try {
    const store = getStore('kinesia-clients');
    const { blobs } = await store.list();
    const clients = await Promise.all(blobs.map(async b => {
      const d = await store.get(b.key, { type: 'json' });
      if (!d) return null;
      return {
        key: b.key,
        prenom: d.prenom || '',
        nom: d.nom || '',
        courriel: d.courriel || '',
        telephone: d.telephone || '',
        lastDate: d.appointments?.at(-1)?.date || '',
        totalSessions: d.appointments?.length || 0,
        intakeCompleted: !!d.intakeCompleted,
      };
    }));
    const list = clients.filter(Boolean).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(list) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};
