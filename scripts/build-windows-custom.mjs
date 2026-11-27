import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

const cliArgs = process.argv.slice(2);
const tauriBin = resolve('node_modules/@tauri-apps/cli/tauri.js');

if (cliArgs[0] !== 'build') {
  run(process.execPath, [tauriBin, ...cliArgs]);
  process.exit(0);
}

const forwarded = cliArgs.slice(1);
const hasBundlesFlag = forwarded.some((a) => a === '-b' || a === '--bundles');
const hasSigningKey = Boolean(
  process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.TAURI_SIGNING_PRIVATE_KEY_PATH,
);
const tauriBuildArgs = ['build'];
if (!hasBundlesFlag) {
  tauriBuildArgs.push('-b', 'nsis');
}
if (!hasSigningKey) {
  tauriBuildArgs.push('--config', JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
}
tauriBuildArgs.push(...forwarded);

console.log('==> [1/4] Building main Tauri Windows binary...');
run(process.execPath, [tauriBin, ...tauriBuildArgs]);

console.log('==> [2/4] Building custom Compress I/O Windows installer...');
run('cargo', ['build', '--release', '--manifest-path', 'src-tauri/installer/Cargo.toml']);

const conf = JSON.parse(readFileSync(resolve('src-tauri/tauri.conf.json'), 'utf8'));
const productName = conf.productName || 'compress-io';
const version = conf.version;
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

const customInstaller = resolve('src-tauri/installer/target/release/compress-io-setup.exe');
const nsisSetup = resolve(
  join('src-tauri/target/release/bundle/nsis', `${productName}_${version}_${arch}-setup.exe`),
);

if (!existsSync(customInstaller)) {
  throw new Error(`Custom installer missing at ${customInstaller}`);
}

console.log(`==> [3/4] Replacing NSIS bundle setup at ${nsisSetup}...`);
copyFileSync(customInstaller, nsisSetup);

if (hasSigningKey) {
  console.log('==> [4/4] Signing custom installer for Tauri updater (.sig)...');
  run(process.execPath, [tauriBin, 'signer', 'sign', '--app-version', version, nsisSetup]);
} else {
  console.log('==> [4/4] Skipping .sig generation (no TAURI_SIGNING_PRIVATE_KEY in environment).');
}
