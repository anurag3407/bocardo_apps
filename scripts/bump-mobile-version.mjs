#!/usr/bin/env node
/**
 * Bumps patch version (e.g. 0.0.1 -> 0.0.2) and Android versionCode (N -> N+1) across specified mobile apps.
 * Updates package.json, app.config.ts, and android/app/build.gradle (if prebuilt locally).
 * Usage: node scripts/bump-mobile-version.mjs [--dry-run] [--github-output] <customer-app|restaurant-app|rider-app|all ...>
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPS = {
  'customer-app': { key: 'customer', dir: 'customer-app' },
  'restaurant-app': { key: 'restaurant', dir: 'restaurant-app' },
  'rider-app': { key: 'rider', dir: 'rider-app' },
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const writeGhOutput = args.includes('--github-output');
const rawTargets = args.filter((a) => !a.startsWith('--'));
const resolvedTargets = rawTargets.flatMap((t) => {
  if (t === 'all') return Object.keys(APPS);
  if (t in APPS) return [t];
  const withSuffix = `${t}-app`;
  if (withSuffix in APPS) return [withSuffix];
  throw new Error(`Unknown app target: ${t}`);
});
const targets = [...new Set(resolvedTargets)];

function nextPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) throw new Error(`Unsupported semver '${version}' (expected X.Y.Z)`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function replaceOnce(content, pattern, replacer, label) {
  let hits = 0;
  const updated = content.replace(pattern, (...m) => {
    hits += 1;
    return replacer(...m);
  });
  if (hits !== 1) throw new Error(`Expected 1 match for ${label}, got ${hits}`);
  return updated;
}

const results = targets.map((dir) => {
  const root = resolve(process.cwd(), dir);
  const pkgPath = resolve(root, 'package.json');
  const appConfigPath = resolve(root, 'app.config.ts');
  const gradlePath = resolve(root, 'android/app/build.gradle');

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const prevVersion = pkg.version;
  const nextVersion = nextPatch(prevVersion);

  const appConfig = readFileSync(appConfigPath, 'utf8');
  const vcMatch = /versionCode:\s*(\d+)/.exec(appConfig);
  if (!vcMatch) throw new Error(`Missing android versionCode in ${appConfigPath}`);
  const prevCode = Number(vcMatch[1]);
  const nextCode = prevCode + 1;

  pkg.version = nextVersion;
  const nextPkgRaw = `${JSON.stringify(pkg, null, 2)}\n`;
  let nextAppConfig = replaceOnce(
    appConfig,
    /(version:\s*')[^']+(')/,
    (_, p1, p2) => `${p1}${nextVersion}${p2}`,
    `${dir}/app.config.ts version`,
  );
  nextAppConfig = replaceOnce(
    nextAppConfig,
    /(versionCode:\s*)\d+/,
    (_, p1) => `${p1}${nextCode}`,
    `${dir}/app.config.ts versionCode`,
  );

  if (!dryRun) {
    writeFileSync(pkgPath, nextPkgRaw, 'utf8');
    writeFileSync(appConfigPath, nextAppConfig, 'utf8');
    if (existsSync(gradlePath)) {
      let gradle = readFileSync(gradlePath, 'utf8');
      gradle = replaceOnce(gradle, /(versionCode\s+)\d+/, (_, p1) => `${p1}${nextCode}`, `${dir}/build.gradle versionCode`);
      gradle = replaceOnce(gradle, /(versionName\s+")[^"]+(")/, (_, p1, p2) => `${p1}${nextVersion}${p2}`, `${dir}/build.gradle versionName`);
      writeFileSync(gradlePath, gradle, 'utf8');
    }
  }

  return {
    key: APPS[dir].key,
    dir,
    prevVersion,
    version: nextVersion,
    versionCode: nextCode,
  };
});

if (writeGhOutput && process.env.GITHUB_OUTPUT) {
  const matrix = JSON.stringify({ include: results });
  const summary = results.map((r) => `${r.key}@${r.version}`).join(', ');
  const lines = [
    `has_apps=${results.length > 0 ? 'true' : 'false'}`,
    `matrix=${matrix}`,
    `summary=${summary}`,
  ];
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
