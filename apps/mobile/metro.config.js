const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
// Inline the resolved Helius fallback into JS as well as the Expo manifest.
// This also works when the general mobile RPC is a different provider.
const privacyRpc = require('./app.config.js').extra.env.EXPO_PUBLIC_PRIVACY_RPC_URL;
if (privacyRpc) process.env.EXPO_PUBLIC_PRIVACY_RPC_URL = privacyRpc;
// Bundle the browser-only privacy SDK locally before Metro resolves the app.
require('node:child_process').execFileSync(process.execPath, [path.join(projectRoot, 'privacy-runtime/build.mjs')], { stdio: 'inherit' });

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), path.resolve(projectRoot, '../../packages/houdini')];

module.exports = config;
