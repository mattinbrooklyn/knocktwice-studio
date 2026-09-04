// Copies product images into Vercel Blob so the search grid does not hotlink
// brand CDNs. Optional: without BLOB_READ_WRITE_TOKEN the original URLs are used.

import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';

const MAX_BYTES = 8 * 1024 * 1024;

export function makeImageCache({ token = process.env.BLOB_READ_WRITE_TOKEN, http, putImpl = put } = {}) {
  if (!token) return null;
  return async function cacheImage(sourceUrl, brandId) {
    const res = await http.request(sourceUrl, { accept: 'image/*', retries: 0 });
    if (!res.ok) throw new Error(`image HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (!type.startsWith('image/')) throw new Error(`not an image: ${type}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error(`image too large: ${buf.length} bytes`);
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[type] || 'img';
    const key = `search/${brandId}/${createHash('sha1').update(sourceUrl).digest('hex').slice(0, 20)}.${ext}`;
    const blob = await putImpl(key, buf, { access: 'public', token, contentType: type, addRandomSuffix: false, allowOverwrite: true });
    return blob.url;
  };
}
