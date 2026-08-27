const { getStore: _getStore } = require('@netlify/blobs');

function getStore(name) {
  return _getStore({
    name,
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });
}

module.exports = { getStore };
