const axios = require('axios');

/**
 * A highly resilient multi-provider runner.
 * Iterates through endpoints in order; returns the first non-null success.
 */
async function tryEndpoints(endpoints, { method = 'GET', extract } = {}) {
  let lastErr = null;
  for (const ep of endpoints) {
    try {
      const res = await axios({
        url: ep.url,
        method: ep.method || method,
        data: ep.data,
        headers: ep.headers,
        timeout: ep.timeout || 20000,
      });
      const value = extract ? extract(res.data, ep) : res.data;
      if (value) return value;
    } catch (e) {
      lastErr = e;
      console.error(`[API Fallback] Endpoint ${ep.url} failed:`, e.message);
    }
  }
  throw new Error(`All fallback endpoints failed. Last error: ${lastErr?.message || 'Unknown'}`);
}

module.exports = { tryEndpoints };
