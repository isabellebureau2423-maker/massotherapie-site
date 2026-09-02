const { getStore } = require('./_blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function findByToken(store, token) {
  const { blobs } = await store.list();
  for (const b of blobs) {
    const d = await store.get(b.key, { type: 'json' });
    if (d?.intakeToken === token) return { key: b.key, data: d };
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const intakeToken = (event.queryStringParameters || {}).token;
  if (!intakeToken) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Token requis' }) };

  const store = getStore('kinesia-clients');
  const found = await findByToken(store, intakeToken);
  if (!found) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Lien invalide ou expiré' }) };

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prenom: found.data.prenom,
        nom: found.data.nom,
        intakeCompleted: !!found.data.intakeCompleted,
      }),
    };
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON invalide' }) }; }

    const fields = ['dateNaissance', 'allergies', 'conditionsMedicales', 'medicaments', 'contreIndications', 'blessures', 'autresInfos', 'activites', 'pression'];
    fields.forEach(f => { if (body[f] !== undefined) found.data[f] = body[f]; });
    found.data.intakeCompleted = true;
    found.data.intakeCompletedAt = new Date().toISOString();
    await store.setJSON(found.key, found.data);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 405, headers: CORS, body: '' };
};
