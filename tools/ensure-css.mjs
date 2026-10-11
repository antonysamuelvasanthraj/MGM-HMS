/** Build the stylesheet on first start so `npm start` alone works. */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = path.join(root, 'client', 'app.css');
const views = path.join(root, 'client', 'views', '_manifest.json');

if (!fs.existsSync(views)) {
  process.stdout.write('  converting the Stitch designs … ');
  execSync('node tools/convert.mjs', { cwd: root, stdio: 'inherit' });
}
if (!fs.existsSync(css) || fs.statSync(css).size < 1000) {
  process.stdout.write('  building the stylesheet (first run only) … ');
  execSync('npx tailwindcss -c tailwind.config.cjs -i client/src/app.src.css -o client/app.css --minify',
    { cwd: root, stdio: 'inherit' });
  console.log('done');
}
