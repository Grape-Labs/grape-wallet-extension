import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(new URL('.', import.meta.url).pathname, '..');
const rootPackagePath = resolve(workspaceRoot, 'package.json');
const extensionPackagePath = resolve(workspaceRoot, 'apps/extension/package.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    throw new Error(`Unsupported version format "${version}". Expected x.y.z.`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

const rootPackage = readJson(rootPackagePath);
const extensionPackage = readJson(extensionPackagePath);

const rootVersion = String(rootPackage.version ?? '').trim();
const extensionVersion = String(extensionPackage.version ?? '').trim();

if (!rootVersion || !extensionVersion) {
  throw new Error('Root and extension package versions must both be set.');
}

if (rootVersion !== extensionVersion) {
  throw new Error(
    `Root package version (${rootVersion}) and extension package version (${extensionVersion}) are out of sync.`
  );
}

const nextVersion = bumpPatch(extensionVersion);

rootPackage.version = nextVersion;
extensionPackage.version = nextVersion;

writeJson(rootPackagePath, rootPackage);
writeJson(extensionPackagePath, extensionPackage);

console.log(`Bumped extension version: ${extensionVersion} -> ${nextVersion}`);
