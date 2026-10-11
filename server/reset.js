import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.SURELY_DATA || path.join(__dirname, '..', 'data');
for (const f of ['surelyhms.db', 'surelyhms.db-wal', 'surelyhms.db-shm']) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('removed', f); }
}
console.log('Database reset. Start the server to reseed.');
