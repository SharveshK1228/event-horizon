// All requests stay same-origin; Vite proxies /api during development.

/**
 * @param {string} path
 * @param {object|null} [body] when present the request is sent as POST JSON
 * @param {AbortSignal} [signal]
 * @param {string} [method] overrides the method inferred from `body`
 * @returns {Promise<any>}
 */
async function request(path, body, signal, method) {
  const response = await fetch(`/api${path}`, {
    signal,
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json();
}

export const api = {
  /**
   * Health, cameras and incidents in one round trip. Throws if the payload
   * shape is unexpected so the UI can show DISCONNECTED rather than guess.
   */
  async snapshot(signal) {
    const [health, cameras, incidents] = await Promise.all([
      request('/healthz', null, signal),
      request('/cameras', null, signal),
      request('/incidents', null, signal),
    ]);
    if (!Array.isArray(cameras) || !Array.isArray(incidents)) {
      throw new Error('Unexpected backend response schema');
    }
    return { health, cameras, incidents };
  },

  status: (id, signal) => request(`/cameras/${encodeURIComponent(id)}/status`, null, signal),
  sop: (id, signal) => request(`/sops/${encodeURIComponent(id)}`, null, signal),
  acknowledge: (id) => request(`/incidents/${encodeURIComponent(id)}/acknowledge`, { local_only: false }),
  ask: (body) => request('/assistant', body),

  /** Drives the backend's own demo scenario switch (POST /api/demo/scenario). */
  setScenario: (scenario) => request('/demo/scenario', { scenario }),

  /** Clips the backend can serve. Listing one starts no analysis. */
  sources: (signal) => request('/sources', null, signal),

  /**
   * Upload a clip as a raw body. Multipart would need a server dependency the
   * API deliberately does not carry, so the File is sent as the body itself.
   * @param {File} file
   * @param {AbortSignal} [signal]
   */
  async uploadSource(file, signal) {
    const response = await fetch('/api/sources', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': encodeFilename(file.name),
      },
      body: file,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || `Upload failed (${response.status})`);
    }
    return response.json();
  },

  deleteSource: (id) =>
    request(`/sources/${encodeURIComponent(id)}`, undefined, undefined, 'DELETE'),
};

/**
 * Header values must be Latin-1; a filename can be anything. Percent-encode it
 * and let the server read the basename it needs.
 */
function encodeFilename(name) {
  return encodeURIComponent(name).replace(/%20/g, ' ');
}
