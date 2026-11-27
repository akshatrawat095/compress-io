import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function run(cmd, args, env = process.env) {
  execFileSync(cmd, args, { stdio: 'inherit', env });
}

function parseTargetTriple(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '-t' || arg === '--target') && args[i + 1]) {
      return args[i + 1];
    }
    if (arg.startsWith('--target=')) {
      return arg.slice('--target='.length);
    }
  }
  return process.env.CARGO_BUILD_TARGET || null;
}

function detectWindowsArch(targetTriple) {
  if (targetTriple) {
    return targetTriple.toLowerCase().startsWith('aarch64') ? 'arm64' : 'x64';
  }
  if (process.arch === 'arm64' || (process.env.PROCESSOR_ARCHITECTURE || '').toUpperCase() === 'ARM64') {
    return 'arm64';
  }
  return 'x64';
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
const targetTriple = parseTargetTriple(forwarded);

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
const installerCargoArgs = [
  'build',
  '--release',
  '--manifest-path',
  'src-tauri/installer/Cargo.toml',
];
if (targetTriple) {
  installerCargoArgs.push('--target', targetTriple);
}
const targetRelDir = targetTriple
  ? resolve(join('src-tauri/target', targetTriple, 'release'))
  : resolve('src-tauri/target/release');
const payloadExe = join(targetRelDir, 'universal-compressor.exe');

run('cargo', installerCargoArgs, {
  ...process.env,
  COMPRESS_IO_PAYLOAD: payloadExe,
});

const conf = JSON.parse(readFileSync(resolve('src-tauri/tauri.conf.json'), 'utf8'));
const productName = conf.productName || 'compress-io';
const version = conf.version;
const arch = detectWindowsArch(targetTriple);

const customInstaller = targetTriple
  ? resolve(join('src-tauri/installer/target', targetTriple, 'release/compress-io-setup.exe'))
  : resolve('src-tauri/installer/target/release/compress-io-setup.exe');

const nsisDir = join(targetRelDir, 'bundle/nsis');
const detectedSetup = existsSync(nsisDir)
  ? readdirSync(nsisDir).find(
      (name) => name.startsWith(`${productName}_${version}_`) && name.endsWith('-setup.exe'),
    )
  : null;
const nsisSetup = join(nsisDir, detectedSetup || `${productName}_${version}_${arch}-setup.exe`);

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
