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

  const { token, key, action } = body;
  if (!verifyToken(token)) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Non autorisé' }) };
  if (!key) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'key requis' }) };

  try {
    const store = getStore('kinesia-clients');
    const data = await store.get(key, { type: 'json' });
    if (!data) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Client introuvable' }) };

    if (action === 'add-note') {
      if (!data.notes) data.notes = [];
      data.notes.unshift({
        date: body.date || new Date().toISOString().slice(0, 10),
        texte: body.texte || '',
        createdAt: new Date().toISOString(),
      });
    } else if (action === 'delete-note') {
      if (data.notes && body.index >= 0) data.notes.splice(body.index, 1);
    } else if (action === 'update-info') {
      const allowed = ['prenom', 'nom', 'dateNaissance', 'telephone', 'adresse'];
      allowed.forEach(f => { if (body[f] !== undefined) data[f] = body[f]; });
    } else if (action === 'update-health') {
      const allowed = ['allergies', 'conditionsMedicales', 'medicaments', 'contreIndications', 'blessures', 'autresInfos', 'dateNaissance'];
      allowed.forEach(f => { if (body[f] !== undefined) data[f] = body[f]; });
      data.intakeCompleted = true;
    }

    data.updatedAt = new Date().toISOString();
    await store.setJSON(key, data);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};
