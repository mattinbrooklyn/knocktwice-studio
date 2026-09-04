// Builds the runtime context for ingest inside a Vercel function.
import { getDb } from './db.js';
import { makeHttp } from './http.js';
import { makeEmbedder } from './embeddings.js';
import { makeImageCache } from './images.js';

export function makeContext() {
  const db = getDb();
  const http = makeHttp();
  const embed = makeEmbedder();
  const cacheImage = makeImageCache({ http });
  const log = (msg) => console.log(`[search] ${msg}`);
  return { db, http, embed, cacheImage, log };
}

export function isCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}
