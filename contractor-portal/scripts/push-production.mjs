import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appJsonPath = fileURLToPath(new URL('../app.json', import.meta.url));
const original = readFileSync(appJsonPath, 'utf8');
const config = JSON.parse(original);
const current = String(config.expo?.extra?.jobOpsRelease ?? config.expo?.version ?? '1.0.0');
const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);

if (!match) {
  throw new Error(`jobOpsRelease must use major.minor.patch format; received ${current}`);
}

const [releaseType, ...messageParts] = process.argv.slice(2);
if (!['major', 'minor', 'patch'].includes(releaseType)) {
  throw new Error('Choose a release type: npm run push:production -- patch|minor|major "Describe this update"');
}

const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]);
const next = releaseType === 'major'
  ? `${major + 1}.0.0`
  : releaseType === 'minor'
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;
config.expo.extra = { ...config.expo.extra, jobOpsRelease: next };
writeFileSync(appJsonPath, `${JSON.stringify(config, null, 2)}\n`);

const message = messageParts.join(' ').trim() || `JobOps ${next} ${releaseType} update`;
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  writeFileSync(appJsonPath, original);
  throw new Error('Run this command through npm: npm run push:production -- patch|minor|major "Describe this update"');
}
const npxCli = resolve(dirname(npmCli), 'npx-cli.js');
console.log(`Preparing ${releaseType} release: v${current} -> v${next}`);
console.log(`After publishing, the Home menu should display: v${next}`);
const result = spawnSync(process.execPath, [
  npxCli,
  'eas-cli@latest',
  'update',
  '--channel', 'production',
  '--environment', 'production',
  '--platform', 'all',
  '--message', message,
], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' });

if (result.error || result.status !== 0) {
  writeFileSync(appJsonPath, original);
  throw result.error ?? new Error(`Production update failed with exit code ${result.status}`);
}

console.log('');
console.log('============================================================');
console.log(`PUBLISHED SUCCESSFULLY: JobOps v${next}`);
console.log(`EXPECTED HOME MENU VERSION: v${next}`);
console.log('============================================================');
console.log('Commit app.json so the next push starts from this version.');
