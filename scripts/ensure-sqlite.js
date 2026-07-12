#!/usr/bin/env node
/**
 * Ensure better-sqlite3's native binary matches the runtime we're about to use.
 *
 * The app runs under Electron (its own NODE_MODULE_VERSION) while the test suite
 * runs under plain Node — a single compiled better_sqlite3.node can only match one
 * ABI at a time. This guard is invoked from the `predev` / `pretest` npm hooks and
 * rebuilds better-sqlite3 for the requested target ONLY when it isn't already built
 * for it, so it stays a no-op on the common path.
 *
 * Usage: node scripts/ensure-sqlite.js <node|electron>
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const target = process.argv[2];
if (target !== 'node' && target !== 'electron') {
  console.error('[ensure-sqlite] usage: ensure-sqlite <node|electron>');
  process.exit(1);
}

// Marker lives inside node_modules (gitignored) — records the last target we built for.
const marker = path.resolve(__dirname, '../node_modules/.better-sqlite3-target');
const readMarker = () => {
  try {
    return fs.readFileSync(marker, 'utf8').trim();
  } catch {
    return '';
  }
};
const writeMarker = (value) => {
  try {
    fs.writeFileSync(marker, value);
  } catch {
    /* best-effort */
  }
};

function rebuild() {
  if (target === 'electron') {
    const version = require('electron/package.json').version;
    console.log(`[ensure-sqlite] rebuilding better-sqlite3 for Electron ${version}…`);
    execSync(
      `npm rebuild better-sqlite3 --runtime=electron --target=${version} --disturl=https://electronjs.org/headers`,
      { stdio: 'inherit' }
    );
    writeMarker(`electron-${version}`);
  } else {
    console.log(
      `[ensure-sqlite] rebuilding better-sqlite3 for Node ${process.versions.node} (abi ${process.versions.modules})…`
    );
    execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
    writeMarker(`node-${process.versions.modules}`);
  }
  console.log('[ensure-sqlite] done');
}

if (target === 'node') {
  // Functional probe: if the binary already loads under this Node, it's correct — skip.
  try {
    const Database = require('better-sqlite3');
    new Database(':memory:').close();
    writeMarker(`node-${process.versions.modules}`);
    console.log(`[ensure-sqlite] better-sqlite3 already matches Node abi ${process.versions.modules}, skipping`);
    process.exit(0);
  } catch {
    rebuild();
  }
} else {
  // Electron can't be loaded under Node to probe, so trust the marker from a prior electron build.
  let version = '';
  try {
    version = require('electron/package.json').version;
  } catch {
    /* electron not resolvable — fall through to rebuild */
  }
  if (version && readMarker() === `electron-${version}`) {
    console.log(`[ensure-sqlite] better-sqlite3 already matches Electron ${version}, skipping`);
    process.exit(0);
  }
  rebuild();
}
