/**
 * verify-core.ts — Boot-time integrity check for src/core/ files.
 *
 * On first run: hashes all core files and stores checksums in ~/.jelly/core-checksums.json.
 * On subsequent runs: compares current hashes to stored ones.
 * If any core file changed, prints a loud warning (does not block startup).
 *
 * Also sets core files to read-only (chmod 444) after first setup.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CORE_FILES = ['vault-ceremony.js', 'verify-core.js'];

function hashFile(filepath: string): string {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');
  } catch { return ''; }
}

function getCoreDir(): string {
  return __dirname;
}

/** Called once after setup to lock core files read-only */
export function lockCoreFiles(): void {
  const coreDir = getCoreDir();
  for (const file of CORE_FILES) {
    const fp = path.join(coreDir, file);
    if (fs.existsSync(fp)) {
      try { fs.chmodSync(fp, 0o444); } catch { /* windows */ }
    }
  }
  // Also lock the .ts source files if present
  for (const file of ['vault-ceremony.ts', 'verify-core.ts']) {
    const fp = path.join(coreDir, file);
    if (fs.existsSync(fp)) {
      try { fs.chmodSync(fp, 0o444); } catch { /* windows */ }
    }
  }
}

/** Called at every agent boot to verify core integrity */
export function verifyCoreIntegrity(jellyHome: string): { ok: boolean; changed: string[] } {
  const checksumPath = path.join(jellyHome, 'core-checksums.json');
  const coreDir = getCoreDir();

  const current: Record<string, string> = {};
  // Hash both .ts and compiled .js if present
  for (const file of [...CORE_FILES, 'vault-ceremony.ts', 'verify-core.ts']) {
    const fp = path.join(coreDir, file);
    const h = hashFile(fp);
    if (h) current[file] = h;
  }

  if (!fs.existsSync(checksumPath)) {
    try {
      fs.mkdirSync(jellyHome, { recursive: true });
      fs.writeFileSync(checksumPath, JSON.stringify(current, null, 2), 'utf-8');
      try { fs.chmodSync(checksumPath, 0o600); } catch { /* windows */ }
    } catch { /* non-fatal */ }
    return { ok: true, changed: [] };
  }

  try {
    const stored = JSON.parse(fs.readFileSync(checksumPath, 'utf-8')) as Record<string, string>;
    const changed: string[] = [];
    for (const [file, hash] of Object.entries(current)) {
      if (stored[file] && stored[file] !== hash) changed.push(file);
    }
    if (changed.length > 0) {
      const R = '\x1b[91m'; const B = '\x1b[1m'; const N = '\x1b[0m';
      console.error(`\n${R}${B}  ⚠  SECURITY WARNING: Core files have changed since install!${N}`);
      console.error(`${R}  Changed: ${changed.join(', ')}${N}`);
      console.error(`${R}  If you did not modify these files, investigate before trading.\n${N}`);
    }
    return { ok: changed.length === 0, changed };
  } catch {
    return { ok: true, changed: [] };
  }
}
