// Encrypts the course for the protected site (docs/kita-a/enc).
// usage: node tools/kita-a/build.js <course folder> <key file>
// The key file holds the 32-byte key in base64. It must NEVER be committed:
// the same key goes only into the Google Apps Script of the seller's sheet.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [src, keyFile] = process.argv.slice(2);
if (!src || !keyFile) { console.error('usage: node build.js <course folder> <key file>'); process.exit(1); }
const key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'base64');
if (key.length !== 32) throw new Error('key must be 32 bytes');
const out = path.join(__dirname, '..', '..', 'docs', 'kita-a', 'enc');
fs.rmSync(out, { recursive: true, force: true });
let n = 0, bytes = 0;
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    const rel = path.relative(src, p).split(path.sep).join('/');
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([iv, c.update(fs.readFileSync(p)), c.final(), c.getAuthTag()]);
    const dst = path.join(out, rel + '.bin');
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, body);
    n++; bytes += body.length;
  }
})(src);
console.log(`encrypted ${n} files, ${(bytes / 1048576).toFixed(1)} MB`);
