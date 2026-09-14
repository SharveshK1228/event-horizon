import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const MEDIA_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
};

/**
 * Serves the repository's `sample crowd videos/` folder at `/samples` during
 * development, so the demo clips are selectable with only the dev server
 * running. The backend's `/api/sources` library is the real route and takes
 * precedence; this is the offline fallback, dev-only, read-only.
 */
function sampleVideos(directory) {
  const listing = () =>
    fs.existsSync(directory)
      ? fs
          .readdirSync(directory)
          .filter((name) => MEDIA_TYPES[path.extname(name).toLowerCase()])
          .map((name) => ({
            source_id: `sample:${name}`,
            name,
            origin: 'bundled',
            size_bytes: fs.statSync(path.join(directory, name)).size,
            url: `/samples/${encodeURIComponent(name)}`,
          }))
      : [];

  return {
    name: 'event-horizon-sample-videos',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/samples', (request, response, next) => {
        if (request.url === '/' || request.url === '/index.json') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ sources: listing() }));
          return;
        }

        const name = path.basename(decodeURIComponent(request.url.split('?')[0]));
        const file = path.join(directory, name);
        const extension = path.extname(name).toLowerCase();
        // Resolve and re-check the parent so a crafted name cannot escape.
        if (!MEDIA_TYPES[extension] || path.dirname(path.resolve(file)) !== path.resolve(directory)) {
          next();
          return;
        }
        if (!fs.existsSync(file)) {
          next();
          return;
        }

        // Range support so the browser can seek without buying the whole file.
        const { size } = fs.statSync(file);
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
        const headers = { 'Content-Type': MEDIA_TYPES[extension], 'Accept-Ranges': 'bytes' };

        if (range) {
          const start = range[1] ? Number(range[1]) : 0;
          const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          response.writeHead(206, {
            ...headers,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': end - start + 1,
          });
          fs.createReadStream(file, { start, end }).pipe(response);
          return;
        }

        response.writeHead(200, { ...headers, 'Content-Length': size });
        fs.createReadStream(file).pipe(response);
      });
    },
  };
}

// The dev server proxies /api to the Python backend so the browser only ever
// talks to one origin. Restart after changing BACKEND_URL in .env.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const samples = env.SAMPLE_VIDEO_DIR || path.resolve(process.cwd(), '..', 'sample crowd videos');

  return {
    plugins: [react(), sampleVideos(samples)],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
