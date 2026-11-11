/**
 * One command to move everything: build styles -> tests -> git commit + push -> deploy to Oracle -> verify.
 *   npm run ship -- "what changed"            (all steps)
 *   npm run ship -- "what changed" --no-test  (skip the test suite)
 * Never touches Oracle's data/ folder. Stops at the first failure.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY = process.env.HMS_ORACLE_KEY || 'C:/Users/SAMUEL/.ssh/hms_oracle_key';
const HOST = process.env.HMS_ORACLE_HOST || 'opc@140.245.201.165';
const APP = '/opt/mgm-hms';
const SSH = `ssh -o StrictHostKeyChecking=accept-new -i "${KEY}" ${HOST}`;
const args = process.argv.slice(2);
const skipTests = args.includes('--no-test');
const message = args.filter((a) => !a.startsWith('--')).join(' ').trim();
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });
const step = (n, text) => console.log(`\n[${n}/6] ${text}`);
const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');

try {
  step(1, 'Building styles');
  sh('npm run build:css');

  step(2, skipTests ? 'Tests skipped (--no-test)' : 'Running tests');
  if (!skipTests) sh('npm test');

  step(3, 'Saving to git and pushing');
  sh('git add -A client server tools package.json .gitignore', { quiet: true, stdio: 'pipe' });
  const pending = sh('git status --porcelain --untracked-files=no', { quiet: true }).trim();
  if (pending) {
    if (!message) throw new Error('There are changes to save. Give a short message: npm run ship -- "what changed"');
    fs.writeFileSync(path.join(os.tmpdir(), 'ship-msg.txt'), `${message}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n`);
    sh(`git commit -q -F "${path.join(os.tmpdir(), 'ship-msg.txt')}"`);
  } else console.log('  nothing new to commit');
  sh('git push -q origin main');
  console.log('  git HEAD', sh('git rev-parse --short HEAD', { quiet: true }).trim(), 'is on origin/main');

  step(4, 'Sending to Oracle (data folder untouched)');
  const files = sh('git ls-files client server tools package.json', { quiet: true }).split('\n').filter(Boolean);
  files.push('client/app.css');   // built, not in git
  // relative paths: a drive letter in the path makes GNU tar think it is a remote host
  fs.mkdirSync('.ship-tmp', { recursive: true });
  const list = '.ship-tmp/files.txt', tar = '.ship-tmp/ship.tar';
  fs.writeFileSync(list, files.join('\n'));
  sh(`tar -cf ${tar} -T ${list}`);
  sh(`scp -q -i "${KEY}" ${tar} ${HOST}:/tmp/ship.tar`);
  sh(`${SSH} "cd ${APP} && tar -xf /tmp/ship.tar && sudo systemctl restart hms; sleep 3; systemctl is-active hms"`);

  step(5, 'Checking Oracle matches this PC, file by file');
  const remote = sh(`${SSH} "cd ${APP} && md5sum ${files.map((f) => `'${f}'`).join(' ')}"`, { quiet: true });
  const theirs = new Map(remote.split('\n').filter(Boolean).map((l) => { const m = l.match(/^([0-9a-f]{32})\s+\*?(.+)$/); return m ? [m[2], m[1]] : null; }).filter(Boolean));
  const bad = files.filter((f) => theirs.get(f) !== md5(f));
  if (bad.length) throw new Error(`Not identical on Oracle: ${bad.slice(0, 10).join(', ')}`);
  console.log(`  ${files.length} files identical on Oracle`);

  step(6, 'Local copy');
  console.log('  This PC is the source, so it is already current. If the local server (start-live.cmd) is running, restart it to load server changes; screens reload with Ctrl+F5.');
  console.log('\nDONE: git, Oracle and this PC hold the same code.');
} catch (err) {
  console.error(`\nSTOPPED: ${err.message}`);
  process.exit(1);
}
