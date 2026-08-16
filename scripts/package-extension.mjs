import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '..');
const extensionRoot = resolve(workspaceRoot, 'apps/extension');
const distDirectory = resolve(extensionRoot, 'dist');
const releaseDirectory = resolve(extensionRoot, 'releases');
const extensionPackage = JSON.parse(readFileSync(resolve(extensionRoot, 'package.json'), 'utf8'));
const version = String(extensionPackage.version ?? '').trim();

if (!version) {
  throw new Error('Cannot package the extension without a package version.');
}

const manifestPath = resolve(distDirectory, 'manifest.json');
if (!existsSync(manifestPath)) {
  throw new Error('Extension dist/manifest.json is missing. Run the Vite build before packaging.');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== version) {
  throw new Error(`Built manifest version ${manifest.version ?? '(missing)'} does not match package version ${version}.`);
}

mkdirSync(releaseDirectory, { recursive: true });
const archiveName = `grape_wallet_extension.${version}.zip`;
const checksumName = `${archiveName}.sha256`;
const archivePath = resolve(releaseDirectory, archiveName);
const checksumPath = resolve(releaseDirectory, checksumName);
rmSync(archivePath, { force: true });
rmSync(checksumPath, { force: true });

const zipResult = spawnSync('zip', ['-X', '-q', '-r', archivePath, '.', '-x', '*.DS_Store'], {
  cwd: distDirectory,
  stdio: 'inherit'
});
if (zipResult.error) {
  throw new Error(`Unable to run zip: ${zipResult.error.message}`);
}
if (zipResult.status !== 0) {
  throw new Error(`zip exited with status ${zipResult.status}.`);
}

const testResult = spawnSync('unzip', ['-tq', archivePath], { stdio: 'inherit' });
if (testResult.error) {
  throw new Error(`Unable to verify ZIP archive: ${testResult.error.message}`);
}
if (testResult.status !== 0) {
  throw new Error(`ZIP verification failed with status ${testResult.status}.`);
}

const digest = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
writeFileSync(checksumPath, `${digest}  ${archiveName}\n`);

console.log(`Distribution ZIP: ${archivePath}`);
console.log(`SHA-256:         ${digest}`);
console.log(`Checksum file:   ${checksumPath}`);
