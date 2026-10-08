import http from 'node:http';
import { waitForMigrations } from '../db/migrate.js';
import { createImageWorker } from './imageWorker.mjs';
import { createVideoWorker } from './videoWorker.mjs';

const kind = process.env.GENERATION_WORKER_KIND;
const createWorker = kind === 'image' ? createImageWorker : kind === 'video' ? createVideoWorker : null;

if (!createWorker) throw new Error('GENERATION_WORKER_KIND must be image or video');

await waitForMigrations();
const worker = await createWorker();
const server = http.createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await worker.close();
  process.exit(0);
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
