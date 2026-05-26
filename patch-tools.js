#!/usr/bin/env node
/**
 * JellyOS patch — applies ALL fixes to your local copy, then recompiles.
 * Run from inside your jellyos folder: node patch-tools.js
 */
const fs   = require("node:fs");
const path = require("node:path");
const os   = require("node:os");
const { execSync, execFileSync } = require("node:child_process");

const ROOT = __dirname;
const ok  = (s) => console.log(`  \x1b[92m✓\x1b[0m ${s}`);
const err = (s) => console.log(`  \x1b[91m✗\x1b[0m ${s}`);
const inf = (s) => console.log(`  \x1b[90m→\x1b[0m ${s}`);

console.log("\n\x1b[96m\x1b[1m  JellyOS patch\x1b[0m\n");

// ── 1. bin/jellyos — write complete fixed file ────────────────────────────────
const binPath = path.join(ROOT, "bin", "jellyos");
const NEW_BIN = `#!/usr/bin/env node
'use strict';

/**
 * JellyOS launcher — runs @jellyos/agent with the JellyOS extension pre-loaded.
 *
 * Usage:
 *   jellyos              — start interactive agent
 *   jellyos setup        — first-time setup wizard
 *   jellyos config       — update API keys / model / settings
 *   jellyos -p "prompt"  — pass-through any agent flags
 */

const { spawn, execFileSync, spawnSync } = require('child_process');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const readline = require('readline');

const PKG_ROOT   = path.resolve(__dirname, '..');
const THEME_DIR  = path.join(PKG_ROOT, 'themes');

// Prefer compiled .mjs (ESM) → .js → fall back to .ts
const EXT_MJS  = path.join(PKG_ROOT, 'extensions', 'jellyos.mjs');
const EXT_JS   = path.join(PKG_ROOT, 'extensions', 'jellyos.js');
const EXT_TS   = path.join(PKG_ROOT, 'extensions', 'jellyos.ts');
const EXT_FILE = fs.existsSync(EXT_MJS) ? EXT_MJS
               : fs.existsSync(EXT_JS)  ? EXT_JS
               : EXT_TS;
const JELLY_HOME = process.env.JELLYOS_HOME || path.join(os.homedir(), '.jelly');

// ── Load .env from JELLY_HOME ────────────────────────────────────────────────
const envPath = path.join(JELLY_HOME, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\\n')) {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Subcommand routing ────────────────────────────────────────────────────────
const cmd = process.argv[2];

if (cmd === 'setup') { runSetup().catch(e => { console.error(e.message); process.exit(1); }); }
else if (cmd === 'config') { runConfig(); }
else { runAgent(); }

// ── config subcommand ────────────────────────────────────────────────────────
function runConfig() {
  const configBin = path.join(PKG_ROOT, 'bin', 'jelly-config');
  if (!fs.existsSync(configBin)) {
    console.error('\\n  jelly-config not found. Re-run setup.\\n');
    process.exit(1);
  }
  const child = spawn(process.execPath, [configBin], {
    stdio: 'inherit',
    env: { ...process.env, JELLYOS_HOME: JELLY_HOME },
  });
  child.on('exit', code => process.exit(code ?? 0));
}

// ── Find @jellyos/agent binary ────────────────────────────────────────────────
function findJellyAgent() {
  const localCli = path.join(PKG_ROOT, 'node_modules', '@jellyos', 'agent', 'dist', 'cli.js');
  if (fs.existsSync(localCli)) return { bin: process.execPath, args: [localCli] };
  try {
    const which  = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(which, ['jellyagent'], { encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] });
    const p = result.trim().split('\\n')[0];
    if (p && fs.existsSync(p)) return { bin: p, args: [] };
  } catch { /* not in PATH */ }
  return null;
}

// ── Boot integrity check ──────────────────────────────────────────────────────
function bootIntegrityCheck() {
  try {
    try { require('ts-node/register'); } catch {}
    const { verifyCoreIntegrity } = require('../src/core/verify-core');
    verifyCoreIntegrity(JELLY_HOME);
  } catch { /* non-fatal */ }
}

// ── Launch agent via @jellyos/agent ──────────────────────────────────────────
function runAgent() {
  bootIntegrityCheck();
  const agent = findJellyAgent();
  if (!agent) {
    console.error([
      '',
      '  @jellyos/agent is not installed.',
      '  Fix it with:',
      '',
      '    npm install @jellyos/agent',
      '',
      '  Then run: jellyos',
      '',
    ].join('\\n'));
    process.exit(1);
  }
  const agentArgs = [
    ...agent.args,
    '--extension',  EXT_FILE,
    '--prompt',     path.join(PKG_ROOT, 'prompts', 'jellyos.md'),
    ...process.argv.slice(2),
  ];
  // ── Wide-char stacking fix ────────────────────────────────────────────────
  // COLUMNS env var is IGNORED when stdio:'inherit' attaches a real TTY.
  // process.stdout.columns reads from the TTY via ioctl, not from env.
  // Use stty cols to actually shrink the TTY width Ink sees, then restore.
  const WIDE_CHAR_OFFSET = 6;
  const rawCols = process.stdout.columns || 120;
  const rawRows = process.stdout.rows    || 40;
  const cols    = Math.max(40, rawCols - WIDE_CHAR_OFFSET);

  try { execFileSync('stty', ['cols', String(cols)], { stdio: 'inherit' }); } catch { /* non-TTY env, skip */ }

  const child = spawn(agent.bin, agentArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      JELLYOS_HOME: JELLY_HOME,
      COLUMNS:     String(cols),
      LINES:       String(rawRows),
      TERM:        process.env.TERM || 'xterm-256color',
      FORCE_COLOR: '3',
    },
  });
  child.on('error', err => { console.error(\`\\nFailed to start JellyOS: \${err.message}\\n\`); process.exit(1); });
  child.on('exit', (code, signal) => {
    try { execFileSync('stty', ['cols', String(rawCols)], { stdio: 'inherit' }); } catch {}
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

// ── Setup wizard ──────────────────────────────────────────────────────────────
async function runSetup() {
  const CY = '\\x1b[96m'; const GD = '\\x1b[93m'; const GR = '\\x1b[92m';
  const RD = '\\x1b[91m'; const GY = '\\x1b[90m'; const BD = '\\x1b[1m'; const NC = '\\x1b[0m';

  console.log(\`\\n\${CY}\${BD}  JellyOS Setup Wizard\${NC}\\n\`);
  fs.mkdirSync(JELLY_HOME, { recursive: true });

  const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = prompt => new Promise(res => rl.question(prompt, res));

  const readKey = key => {
    const re = new RegExp(\`^\${key}=(.*)$\`, 'm');
    const m  = fs.existsSync(envPath) ? re.exec(fs.readFileSync(envPath, 'utf-8')) : null;
    return m ? m[1].replace(/^["']|["']$/g, '') : '';
  };
  const writeKey = (key, val) => {
    const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    const re   = new RegExp(\`^\${key}=.*$\`, 'm');
    const line = \`\${key}=\${val}\`;
    fs.writeFileSync(envPath, re.test(content) ? content.replace(re, line) : content + (content.endsWith('\\n') ? '' : '\\n') + line + '\\n');
    try { fs.chmodSync(envPath, 0o600); } catch {}
  };

  // ── Seed .env from .env.example if it doesn't exist yet ──────────────────
  // Puts ALL variables (models, effect level, Telegram, Discord, webhook port,
  // etc.) into ~/.jelly/.env so users can edit them directly.
  // The wizard below then overwrites just the prompted keys on top.
  const examplePath = path.join(PKG_ROOT, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.writeFileSync(envPath, fs.readFileSync(examplePath, 'utf-8'), 'utf-8');
    try { fs.chmodSync(envPath, 0o600); } catch {}
    console.log(\`  \${GR}✓\${NC} Created \${envPath} from .env.example template\\n\`);
  } else if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, '', 'utf-8');
    try { fs.chmodSync(envPath, 0o600); } catch {}
  }

  // ── API Keys ──────────────────────────────────────────────────────────────
  console.log(\`\${BD}  API Keys\${NC}\`);
  const fields = [
    { key: 'OPENROUTER_API_KEY',  label: 'OpenRouter API key',    hint: 'https://openrouter.ai/keys', required: true  },
    { key: 'ALCHEMY_KEY',         label: 'Alchemy key',           hint: 'https://alchemy.com',         required: false },
    { key: 'COINGECKO_API_KEY',   label: 'CoinGecko Pro key',     hint: 'optional',                   required: false },
    { key: 'POLYMARKET_API_KEY',  label: 'Polymarket key',        hint: 'optional',                   required: false },
    { key: 'BIRDEYE_API_KEY',     label: 'Birdeye key',           hint: 'optional',                   required: false },
  ];
  for (const f of fields) {
    const current = readKey(f.key) || process.env[f.key] || '';
    const hint    = \`\${GY}(\${f.hint})\${NC}\`;
    const kept    = current ? \` \${GY}[set — Enter to keep]\${NC}\` : '';
    const val     = (await ask(\`  \${f.label} \${hint}\${kept}: \`)).trim();
    if (val)                           writeKey(f.key, val);
    else if (!current && f.required)   { console.log(\`\\n  \${RD}Required key not set. Exiting.\${NC}\\n\`); rl.close(); process.exit(1); }
  }
  console.log(\`\\n  \${GR}✓\${NC} Config saved → \${envPath}\\n\`);

  rl.close();

  // ── Wallet helpers ────────────────────────────────────────────────────────
  // Pure-JS keccak256 — zero external dependencies.
  // Ethers v6 is ESM-only and cannot be require()'d; we avoid it entirely here.
  const crypto = require('crypto');

  function _keccak256(data) {
    const inp = Buffer.isBuffer(data) ? data
      : Buffer.from(data instanceof Uint8Array ? data : data.replace(/^0x/,''), 'hex');
    const RC=[[0x00000001,0],[0x00008082,0],[0x0000808A,0x80000000],[0x80008000,0x80000000],[0x0000808B,0],[0x80000001,0],[0x80008081,0x80000000],[0x00008009,0x80000000],[0x0000008A,0],[0x00000088,0],[0x80008009,0],[0x8000000A,0],[0x8000808B,0],[0x0000008B,0x80000000],[0x00008089,0x80000000],[0x00008003,0x80000000],[0x00008002,0x80000000],[0x00000080,0x80000000],[0x0000800A,0],[0x8000000A,0x80000000],[0x80008081,0x80000000],[0x00008080,0x80000000],[0x80000001,0],[0x80008008,0x80000000]];
    const ROT=[0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
    const PI=[0,10,20,5,15,16,1,11,21,6,7,17,2,12,22,23,8,18,3,13,14,24,9,19,4];
    function r64(lo,hi,n){n&=63;if(!n)return[lo,hi];if(n===32)return[hi,lo];if(n<32)return[(lo<<n)|(hi>>>(32-n))>>>0,(hi<<n)|(lo>>>(32-n))>>>0];n-=32;return[(hi<<n)|(lo>>>(32-n))>>>0,(lo<<n)|(hi>>>(32-n))>>>0];}
    function kf(s){
      for(let r=0;r<24;r++){
        const C=new Uint32Array(10);
        for(let x=0;x<5;x++){C[x*2]=s[x*2]^s[(x+5)*2]^s[(x+10)*2]^s[(x+15)*2]^s[(x+20)*2];C[x*2+1]=s[x*2+1]^s[(x+5)*2+1]^s[(x+10)*2+1]^s[(x+15)*2+1]^s[(x+20)*2+1];}
        for(let x=0;x<5;x++){const[dl,dh]=r64(C[((x+1)%5)*2],C[((x+1)%5)*2+1],1);const tl=C[((x+4)%5)*2]^dl,th=C[((x+4)%5)*2+1]^dh;for(let y=0;y<5;y++){s[(y*5+x)*2]^=tl;s[(y*5+x)*2+1]^=th;}}
        const B=new Uint32Array(50);
        for(let i=0;i<25;i++){const[rl,rh]=r64(s[i*2],s[i*2+1],ROT[i]);B[PI[i]*2]=rl;B[PI[i]*2+1]=rh;}
        for(let y=0;y<5;y++)for(let x=0;x<5;x++){const i=y*5+x,j=y*5+(x+1)%5,k=y*5+(x+2)%5;s[i*2]=B[i*2]^(~B[j*2]&B[k*2]);s[i*2+1]=B[i*2+1]^(~B[j*2+1]&B[k*2+1]);}
        s[0]^=RC[r][0];s[1]^=RC[r][1];
      }
    }
    const RATE=136,st=new Uint32Array(50);let off=0;
    for(;off+RATE<=inp.length;off+=RATE){
      for(let i=0;i<17;i++){st[i*2]^=inp.readUInt32LE(off+i*8);st[i*2+1]^=inp.readUInt32LE(off+i*8+4);}
      kf(st);
    }
    const last=Buffer.alloc(RATE,0);inp.copy(last,0,off);
    last[inp.length-off]=0x01;last[RATE-1]|=0x80;
    for(let i=0;i<17;i++){st[i*2]^=last.readUInt32LE(i*8);st[i*2+1]^=last.readUInt32LE(i*8+4);}
    kf(st);
    const out=Buffer.alloc(32);
    for(let i=0;i<4;i++){out.writeUInt32LE(st[i*2],i*8);out.writeUInt32LE(st[i*2+1],i*8+4);}
    return '0x'+out.toString('hex');
  }

  const B32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function bech32Encode(hrp, data) {
    const words = [];
    let acc = 0, bits = 0;
    for (const b of data) {
      acc = (acc << 8) | b; bits += 8;
      while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 0x1f); }
    }
    if (bits > 0) words.push((acc << (5 - bits)) & 0x1f);
    const hrpBytes = hrp.split('').map(c => c.charCodeAt(0));
    let cs = 1;
    for (const v of [...hrpBytes.map(b => b >> 5), 0, ...hrpBytes.map(b => b & 31), ...words, 0,0,0,0,0,0]) {
      const b = cs >> 25;
      cs = ((cs & 0x1ffffff) << 5) ^ v ^
        (-(b >> 0 & 1) & 0x3b6a57b2) ^ (-(b >> 1 & 1) & 0x26508e6d) ^
        (-(b >> 2 & 1) & 0x1ea119fa) ^ (-(b >> 3 & 1) & 0x3d4233dd) ^
        (-(b >> 4 & 1) & 0x2a1462b3);
    }
    const checksum = [0,1,2,3,4,5].map(i => (cs >> (5 * (5 - i))) & 0x1f);
    return hrp + '1' + [...words, ...checksum].map(d => B32_CHARSET[d]).join('');
  }

  function base58Encode(buf) {
    const CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt('0x' + buf.toString('hex')), str = '';
    while (num > 0n) { str = CHARS[Number(num % 58n)] + str; num /= 58n; }
    for (const b of buf) { if (b !== 0) break; str = '1' + str; }
    return str || '1';
  }

  function genEVM() {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    const privHex  = ecdh.getPrivateKey('hex');
    const pubBytes = ecdh.getPublicKey().slice(1);
    const hashHex  = _keccak256(pubBytes).slice(2);
    const addrRaw  = hashHex.slice(-40);
    const addrHash = _keccak256(Buffer.from(addrRaw, 'utf-8')).slice(2);
    const address  = '0x' + [...addrRaw].map((c, i) => parseInt(addrHash[i], 16) >= 8 ? c.toUpperCase() : c).join('');
    return { chain: 'evm', address, privateKey: '0x' + privHex };
  }

  function genSolana() {
    try {
      const localSol = path.join(PKG_ROOT, 'node_modules', '@solana', 'web3.js');
      const { Keypair } = require(fs.existsSync(localSol) ? localSol : '@solana/web3.js');
      const kp = Keypair.generate();
      return { chain: 'solana', address: kp.publicKey.toBase58(), privateKey: Buffer.from(kp.secretKey).toString('hex') };
    } catch {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const pub = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
      return { chain: 'solana', address: base58Encode(pub), privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex') };
    }
  }

  function genCosmos() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pub = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
    let hash;
    try { hash = crypto.createHash('ripemd160').update(crypto.createHash('sha256').update(pub).digest()).digest(); }
    catch { hash = crypto.createHash('sha256').update(crypto.createHash('sha256').update(pub).digest()).digest().slice(0, 20); }
    return { chain: 'cosmos', address: bech32Encode('cosmos', hash), privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex') };
  }

  function saveWallet(wallet, dir) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, \`\${wallet.chain}.json\`);
    fs.writeFileSync(file, JSON.stringify(wallet, null, 2), 'utf-8');
    try { fs.chmodSync(file, 0o600); } catch {}
  }

  // ── Cold Vault Key Generation ─────────────────────────────────────────────
  console.log(\`\${BD}  Cold Vault Key Generation\${NC}\`);
  const vaultAddrFile = path.join(JELLY_HOME, 'vault-addresses.json');
  if (fs.existsSync(vaultAddrFile)) {
    console.log(\`  \${GY}→ Cold vault keys already present — skipped\${NC}\\n\`);
  } else {
    const vEVM    = genEVM();
    const vSol    = genSolana();
    const vCosmos = genCosmos();

    // Show PRIVATE KEYS — user must write these down. They are NEVER saved to disk.
    const OR = '\\x1b[38;5;214m';
    console.log(\`\\n\${OR}\${BD}  ┌─────────────────────────────────────────────────────────┐\${NC}\`);
    console.log(\`\${OR}\${BD}  │  ⚠  COLD VAULT — WRITE DOWN YOUR PRIVATE KEYS NOW      │\${NC}\`);
    console.log(\`\${OR}\${BD}  │     They will NOT be shown again and NOT saved to disk.  │\${NC}\`);
    console.log(\`\${OR}\${BD}  └─────────────────────────────────────────────────────────┘\${NC}\\n\`);
    console.log(\`  \${GY}  EVM (Ethereum / Base / Arbitrum)\${NC}\`);
    console.log(\`  \${GY}  address    \${NC} \${vEVM.address}\`);
    console.log(\`  \${GY}  privateKey \${NC} \${vEVM.privateKey}\\n\`);
    console.log(\`  \${GY}  Solana\${NC}\`);
    console.log(\`  \${GY}  address    \${NC} \${vSol.address}\`);
    console.log(\`  \${GY}  privateKey \${NC} \${vSol.privateKey}\\n\`);
    console.log(\`  \${GY}  Cosmos\${NC}\`);
    console.log(\`  \${GY}  address    \${NC} \${vCosmos.address}\`);
    console.log(\`  \${GY}  privateKey \${NC} \${vCosmos.privateKey}\\n\`);
    console.log(\`  \${GY}The agent can send profits TO these addresses but CANNOT withdraw.\${NC}\`);
    console.log(\`  \${GY}Only you can move funds using the private keys you write down above.\${NC}\\n\`);

    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = await new Promise(res => rl2.question(
      \`\${OR}\${BD}  Have you written down ALL private keys above? Type YES to continue: \${NC}\`,
      res
    ));
    rl2.close();

    if (confirm.trim().toUpperCase() !== 'YES') {
      console.log(\`\\n  \${RD}✗ Confirmation not received. Run setup again when ready.\${NC}\\n\`);
      process.exit(1);
    }

    // Save ONLY public addresses — private keys are NEVER written to disk.
    fs.writeFileSync(vaultAddrFile, JSON.stringify({
      evm: vEVM.address, solana: vSol.address, cosmos: vCosmos.address,
    }, null, 2), 'utf-8');
    console.log(\`\\n  \${GR}✓\${NC} Vault addresses saved (public only — private keys are yours alone)\\n\`);
  }

  // ── Trading Wallet Generation ─────────────────────────────────────────────
  console.log(\`\${BD}  Trading Wallet Generation\${NC}\`);
  const walletsDir = path.join(JELLY_HOME, 'wallets');
  const evmFile    = path.join(walletsDir, 'evm.json');
  if (fs.existsSync(evmFile)) {
    const evm = JSON.parse(fs.readFileSync(evmFile, 'utf-8'));
    console.log(\`  \${GY}→ Wallets already present — skipped\${NC}\`);
    console.log(\`  \${GY}  evm     \${NC} \${evm.address}\\n\`);
  } else {
    const wEVM    = genEVM();
    const wSol    = genSolana();
    const wCosmos = genCosmos();
    saveWallet(wEVM,    walletsDir);
    saveWallet(wSol,    walletsDir);
    saveWallet(wCosmos, walletsDir);
    console.log(\`\\n  \${GR}✓\${NC} Trading wallets saved to \${walletsDir}/\`);
    console.log(\`  \${GY}  evm     \${NC} \${wEVM.address}\`);
    console.log(\`  \${GY}  solana  \${NC} \${wSol.address}\`);
    console.log(\`  \${GY}  cosmos  \${NC} \${wCosmos.address}\`);
    console.log(\`\\n  \${GY}Fund these addresses to give the agent capital to trade with.\${NC}\\n\`);
  }

  console.log(\`\${GR}\${BD}  Setup complete!\${NC}\`);
  console.log(\`  Run: \${BD}jellyos\${NC}          — start the agent\`);
  console.log(\`  Run: \${BD}jellyos config\${NC}   — update settings later\\n\`);
}
`;

fs.mkdirSync(path.join(ROOT, "bin"), { recursive: true });
fs.writeFileSync(binPath, NEW_BIN, "utf-8");
try { fs.chmodSync(binPath, 0o755); } catch {}
ok("bin/jellyos replaced (ethers multi-loader, no ts-node, no vault-ceremony)");

// ── 1b. Vault-keys migration: warn about private keys on disk ────────────────
// Old behavior: private keys were saved to ~/.jelly/vault-keys/
// New behavior: private keys are NEVER saved — shown once at setup, user writes them down.
// If vault-keys/ exists, it has their private keys. We warn (never auto-delete).
const jellyHome = path.join(os.homedir(), ".jelly");
const oldVaultDir = path.join(jellyHome, "vault-keys");
if (fs.existsSync(oldVaultDir)) {
  console.log("\n  \x1b[93m⚠\x1b[0m  ~/.jelly/vault-keys/ exists with your EVM/Solana/Cosmos private keys.");
  console.log("      New behavior: private keys are NEVER saved to disk. Only public addresses");
  console.log("      are stored in vault-addresses.json.");
  console.log("      Action: Copy your private keys out of ~/.jelly/vault-keys/ to a safe");
  console.log("      offline location (paper / hardware wallet), then delete the folder:\n");
  console.log("        rm -rf ~/.jelly/vault-keys\n");
} else {
  inf("vault-keys/: not present (correct — private keys are never saved to disk)");
}

// ── 2. package.json: ensure ethers is a direct dependency ────────────────────
const pkgPath = path.join(ROOT, "package.json");
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (!pkg.dependencies) pkg.dependencies = {};
  if (!pkg.dependencies["ethers"]) {
    pkg.dependencies["ethers"] = "^6.0.0";
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    ok("package.json: added ethers ^6.0.0 as direct dependency");
  } else {
    inf("package.json: ethers already listed");
  }
} else {
  err("package.json not found");
}

// ── 3. npm install — ensure all deps including ethers are installed ───────────
console.log("\n  Checking dependencies...");
const ethersExists = fs.existsSync(path.join(ROOT, "node_modules", "ethers"));
if (!ethersExists) {
  console.log("  Running npm install (first time, ~30s)...");
  try {
    // --loglevel=error hides "npm warn deprecated" noise from transitive deps
    // --no-audit / --no-fund suppress the vulnerability and funding summaries
    execSync("npm install --loglevel=error --no-audit --no-fund", { cwd: ROOT, stdio: "inherit" });
    ok("npm install complete");
  } catch (e) {
    err(`npm install failed: ${e.message}`);
    console.log("  Run npm install manually, then try again.\n");
  }
} else {
  inf("node_modules/ethers already installed");
}

// ── 3b. Patch @jellyos/agent cli.js — redirect console after render() ────────
// Root cause of stacked borders: console.log/error/warn called while Ink owns
// the terminal writes raw bytes to stdout. Ink's cursor-up count doesn't know
// about those bytes → next frame redraws from the wrong row → stacked borders.
// Fix: (a) inject wireNotify import so safeLog utility is wired to the TUI,
//      (b) patch all three console methods right after render(),
//      (c) add explicit policy note about process.stdout.write.
const agentCliPath = path.join(ROOT, "node_modules", "@jellyos", "agent", "dist", "cli.js");
if (fs.existsSync(agentCliPath)) {
  let cliSrc = fs.readFileSync(agentCliPath, "utf-8");
  let cliChanged = false;

  // (a) inject wireNotify import after the theme import line
  if (!cliSrc.includes("wireNotify")) {
    const THEME_IMPORT = `import { T } from "./tui/theme.js";`;
    const THEME_IMPORT_WITH_SAFE = `import { T } from "./tui/theme.js";\nimport { wireNotify } from "./util/safeLog.js";`;
    if (cliSrc.includes(THEME_IMPORT)) {
      cliSrc = cliSrc.replace(THEME_IMPORT, THEME_IMPORT_WITH_SAFE);
      cliChanged = true;
    }
    // Wire wireNotify in the onNotifyReady callback
    const OLD_READY = `onNotifyReady: (fn) => { _notifyFn = fn; },`;
    const NEW_READY = `onNotifyReady: (fn) => { _notifyFn = fn; wireNotify(fn); },`;
    if (cliSrc.includes(OLD_READY)) {
      cliSrc = cliSrc.replace(OLD_READY, NEW_READY);
      cliChanged = true;
    }
  }

  // (b) console patch + process.stdout.write policy note
  if (!cliSrc.includes("_safeLog")) {
    const RENDER_END = `}), { exitOnCtrlC: false });`;
    const CONSOLE_PATCH = `}), { exitOnCtrlC: false });
    // Ink owns the terminal from this point on. Any console.log/error/warn
    // writes raw bytes to stdout, bypassing Ink's rendering buffer. Ink's
    // cursor-up calculation becomes wrong → stacked border lines.
    // NOTE: process.stdout.write is intentionally NOT patched — Ink uses it
    // for every render frame; intercepting it globally would break Ink output.
    const _safeLog = (...args) => {
        const msg = args.map(a => (typeof a === "string" ? a : String(a))).join(" ");
        _notifyFn?.(msg);
    };
    console.log = _safeLog;
    console.error = _safeLog;
    console.warn = _safeLog;`;
    if (cliSrc.includes(RENDER_END)) {
      cliSrc = cliSrc.replace(RENDER_END, CONSOLE_PATCH);
      cliChanged = true;
    } else {
      inf("@jellyos/agent cli.js: render() pattern not found — may be a different version");
    }
  } else {
    inf("@jellyos/agent cli.js: console patch already applied");
  }

  // (c) SIGWINCH resize fix — prepend a handler that clears the screen before
  // Ink's own SIGWINCH handler fires. Without this, going full-screen causes
  // Ink to erase the previous frame using its old (narrow) line count, which is
  // wrong at the new width → the entire chat duplicates on every resize.
  if (!cliSrc.includes("SIGWINCH")) {
    const SIGWINCH_PATCH = `    process.prependListener("SIGWINCH", () => {
        process.stdout.write("\\x1B[2J\\x1B[H");
    });
    `;
    const SAFE_LOG_ANCHOR = `    const _safeLog = (...args) => {`;
    if (cliSrc.includes(SAFE_LOG_ANCHOR)) {
      cliSrc = cliSrc.replace(SAFE_LOG_ANCHOR, SIGWINCH_PATCH + SAFE_LOG_ANCHOR);
      cliChanged = true;
    } else {
      inf("@jellyos/agent cli.js: SIGWINCH anchor not found — skip resize fix");
    }
  } else {
    inf("@jellyos/agent cli.js: SIGWINCH resize fix already applied");
  }

  if (cliChanged) {
    fs.writeFileSync(agentCliPath, cliSrc, "utf-8");
    ok("@jellyos/agent cli.js: patched (console redirect + wireNotify + SIGWINCH resize fix)");
  }
} else {
  inf("@jellyos/agent not installed yet — cli.js patch will apply after npm install");
}

// ── 3c. Patch @jellyos/agent loader.js — redirect extension console ──────────
// Extension's fn(api) registration phase may call console.log before Ink
// mounts. Wrap the call so those outputs go through ui.notify instead of
// landing on raw stdout where they could corrupt Ink's cursor count.
const agentLoaderPath = path.join(ROOT, "node_modules", "@jellyos", "agent", "dist", "loader.js");
if (fs.existsSync(agentLoaderPath)) {
  let loaderSrc = fs.readFileSync(agentLoaderPath, "utf-8");
  if (loaderSrc.includes("_origLog")) {
    inf("@jellyos/agent loader.js: console redirect already applied");
  } else {
    const OLD_CALL = `    await fn(api);\n}`;
    const NEW_CALL = `    const _origLog = console.log;
    const _origError = console.error;
    const _origWarn = console.warn;
    const _extLog = (...args) => {
        const msg = args.map(a => (typeof a === "string" ? a : String(a))).join(" ");
        ui.notify(msg);
    };
    console.log = _extLog;
    console.error = _extLog;
    console.warn = _extLog;
    try {
        await fn(api);
    }
    finally {
        console.log = _origLog;
        console.error = _origError;
        console.warn = _origWarn;
    }
}`;
    if (loaderSrc.includes(OLD_CALL)) {
      loaderSrc = loaderSrc.replace(OLD_CALL, NEW_CALL);
      fs.writeFileSync(agentLoaderPath, loaderSrc, "utf-8");
      ok("@jellyos/agent loader.js: extension console redirect applied");
    } else {
      inf("@jellyos/agent loader.js: fn(api) pattern not found — may be a different version");
    }
  }
} else {
  inf("@jellyos/agent not installed yet — loader.js patch will apply after npm install");
}

// ── 3d. Create @jellyos/agent dist/util/safeLog.js ───────────────────────────
// The safeLog utility must exist in the installed package so cli.js can import
// it via "./util/safeLog.js". Create it if not already present.
const agentUtilDir  = path.join(ROOT, "node_modules", "@jellyos", "agent", "dist", "util");
const agentSafeLog  = path.join(agentUtilDir, "safeLog.js");
if (!fs.existsSync(agentSafeLog)) {
  fs.mkdirSync(agentUtilDir, { recursive: true });
  fs.writeFileSync(agentSafeLog, `import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const JELLY_HOME = process.env.JELLYOS_HOME ?? join(homedir(), ".jelly");
const DEBUG_LOG = join(JELLY_HOME, "debug.log");
let _notifyFn = null;
export function wireNotify(fn) { _notifyFn = fn; }
export function safeLog(...args) {
    const msg = args.map(a => (typeof a === "string" ? a : String(a))).join(" ");
    if (_notifyFn) { _notifyFn(msg); }
    else { try { mkdirSync(JELLY_HOME, { recursive: true }); appendFileSync(DEBUG_LOG, \`[\${new Date().toISOString()}] \${msg}\\n\`); } catch {} }
}
`, "utf-8");
  ok("@jellyos/agent dist/util/safeLog.js: created");
} else {
  inf("@jellyos/agent dist/util/safeLog.js: already exists");
}

// ── 3e. Patch @jellyos/agent dist/tui/App.js — remove height="100%" ──────────
// Root cause of border stacking on EVERY re-render (typing, streaming, messages):
// height="100%" tells Ink to render a frame exactly process.stdout.rows tall.
// On re-render Ink moves cursor up by that fixed count. If the actual rendered
// output differs by even one line (wide chars, wrap, terminal mismatch), the top
// border is not fully erased → a new copy stacks on every state change.
// Fix: remove height="100%" so Ink renders at natural content height and erases
// exactly the lines it drew — no fixed row-count arithmetic to go wrong.
const agentAppPath = path.join(ROOT, "node_modules", "@jellyos", "agent", "dist", "tui", "App.js");
if (fs.existsSync(agentAppPath)) {
  let appSrc = fs.readFileSync(agentAppPath, "utf-8");
  if (!appSrc.includes(`height: "100%"`)) {
    inf("@jellyos/agent App.js: height:100% already removed");
  } else {
    appSrc = appSrc.replace(`{ flexDirection: "column", height: "100%", children:`, `{ flexDirection: "column", children:`);
    fs.writeFileSync(agentAppPath, appSrc, "utf-8");
    ok("@jellyos/agent App.js: removed height:100% (fixes border stacking on every re-render)");
  }
} else {
  inf("@jellyos/agent not installed yet — App.js patch will apply after npm install");
}

// ── 4. Logger: disable consoleOutput ─────────────────────────────────────────
const loggerPath = path.join(ROOT, "src", "core", "utils", "Logger.ts");
if (fs.existsSync(loggerPath)) {
  let src = fs.readFileSync(loggerPath, "utf-8");
  if (src.includes("consoleOutput: true")) {
    src = src.replace("consoleOutput: true", "consoleOutput: false");
    fs.writeFileSync(loggerPath, src, "utf-8");
    ok("Logger console output disabled (stops TUI flood)");
  } else {
    inf("Logger already patched");
  }
} else {
  inf("Logger.ts not found — skipping");
}

// ── 5. System prompt: plain text, no markdown ─────────────────────────────────
const promptPath = path.join(ROOT, "prompts", "jellyos.md");
if (fs.existsSync(promptPath)) {
  const NEW_PROMPT = `# JellyOS

You are JellyOS, an autonomous AI trading agent for blockchain analytics, prediction markets, and automated DeFi trading. You are opinionated, direct, and technically precise.

You are JellyOS. You are NOT the underlying @jellyos/agent framework. Never identify yourself as the base agent framework or mention pi.dev, or earendil in responses.

## Identity

- Name: JellyOS (call yourself "jelly" informally)
- Personality: sharp, confident, data-driven — like a seasoned quant trader
- No hedging. No disclaimers unless financial risk is genuinely involved.

## OUTPUT FORMAT — CRITICAL

You are running inside a terminal UI. Plain text only. Follow these rules exactly:

1. NO markdown. Never use ##, **, *, \`, _underscores_, or any markdown syntax.
2. Use plain section headers like:   BITCOIN ANALYSIS   (all caps, no #)
3. Use box-drawing characters for tables and grids: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼
4. Use indentation (2 spaces) for sub-items instead of bullets. If you must use bullets, use a dash: -
5. Numbers and data: use plain alignment with spaces, not markdown tables.
6. Keep responses concise. No filler phrases. Lead with the data.
7. When running tools, briefly say what you are doing on a single line before calling.

Example of CORRECT output:
  BTC   $77,659  +1.68%  Vol $23B   NEUTRAL
  ETH   $2,125   +1.44%  Vol $9.9B  NEUTRAL
  SOL   $86.12   +1.15%  Vol $2.3B  NEUTRAL

Example of WRONG output (never do this):
  ## Bitcoin Analysis
  **Price:** $77,659

## CRITICAL — Local Machine Access

JellyOS runs 100% locally on the user's machine. You have full access to the local filesystem, terminal, and installed apps.

You MUST use your tools to take action. Never tell the user you cannot do something that a registered tool supports:

- "open brave"              call open_app with target="Brave Browser"
- "open chrome"             call open_app with target="Google Chrome"
- "run this command"        call run_shell
- "read this file"          call read_file
- "write this to a file"    call write_file
- "what's in my downloads"  call run_shell with command="ls ~/Downloads"
- "search google for X"     call open_app with target="https://google.com/search?q=X"

Never say "I can't open apps" or "I don't have access to your file system". You do. Use the tools.

## Capabilities

Domain tools:
- Market data     real-time prices, funding rates, fear/greed, DeFi TVL
- Blockchain      wallet balances, whale scanning, gas prices, 16-chain support
- Trading         position sizing, risk calculation, DEX trade execution
- Vault           profit ledger (AES-256-GCM encrypted)
- Prediction      Polymarket, Kalshi, signal generation
- Feeds           live news, whale alerts, on-chain signals
- Web             fetch any public URL, strip to plain text
- Shell           run any terminal command on the user's machine (run_shell)
- Apps            open any app, file, or URL (open_app)
- Files           read and write files anywhere on the local machine (read_file / write_file)

## Wallet Architecture

Trading wallet (hot): Your operational wallet. Stored encrypted on disk. You can sign transactions and trade autonomously.

Vault (cold): A separate keypair the user generated at setup and saved offline. You only know the public address. You can send profits there but cannot withdraw — only the user can with their private key.

## Operating Principles

1. Always use tools — never guess at data you can fetch.
2. Confirm destructive actions — trades, sweeps, wallet ops require explicit user confirmation.
3. Flag high risk — if risk/reward below 1:1 or position > 5% of portfolio, say so.
4. Multi-signal analysis — check price, funding rates, and fear/greed before giving a verdict.
5. Vault first — suggest sweeping realized profits to vault after successful trades.

## Effect Levels

eco    minimal tool calls, fastest responses
normal standard tool usage (default)
turbo  parallel multi-tool analysis
max    every relevant tool, full signal synthesis before responding

## Slash Commands

/vault              Vault ledger balance and lock status
/wallets            Trading wallet addresses + cold vault addresses
/status             Full system status
/feeds              Recent live feed items
/signals            Active trading signals
/positions          Open positions tracked by the agent
/risk               Risk profile and exposure
/history [N]        Vault sweep log (last N entries)
/pnl                Profit and loss summary
/watchlist          Tracked assets — add: /watchlist add BTC
/gas                Gas prices across chains
/tvl [protocol]     DeFi TVL lookup
/whale <address>    Whale scan on any address
/chain [name]       Show or set active chain
/schedule           AutoVault schedule and task queue
/effect [level]     Trading intensity: eco / normal / turbo / max
/model [name|N|next] Show, pick, or cycle models
/config             Current settings (keys masked)
/skills             Installed Jelly Skills
/network            Chain connectivity and RPC health
/ping               Quick health check
/memo [text]        Pin a note to session context
/agents             Sub-agent and swarm status
/export             Export vault ledger to CSV
/debug              Last tool calls with timing
/panic              Emergency: stop feeds, sweep and lock vault, close positions
/lock               Lock the vault ledger
/unlock <pass>      Unlock the vault ledger
/changelog          JellyOS release notes
`;
  fs.writeFileSync(promptPath, NEW_PROMPT, "utf-8");
  ok("System prompt updated (plain text, no markdown)");
} else {
  err("prompts/jellyos.md not found");
}

// ── 6. Extension: inject local system tools if missing ───────────────────────
const extPath = path.join(ROOT, "extensions", "jellyos.ts");
if (fs.existsSync(extPath)) {
  let src = fs.readFileSync(extPath, "utf-8");
  let extChanged = false;

  // ── Fix: remove setHeader entirely (definitive stacking-border fix) ──────────
  // Root cause: agent calls render() on every streaming token. Our custom header
  // returned a new array each call → agent treated it as "changed" → full frame
  // redraw emitted a new ┌────────────────┐ border without erasing the old one.
  // Fix: remove setHeader. Branding lives in the status bar (always stable).
  if (src.includes('ctx.ui.setHeader(')) {
    // Remove the full setHeader block — from the "Replace agent built-in header"
    // comment through the closing })); — and also remove any prior "Activate jelly theme" block if it wraps into it
    const OLD_HEADER = /\/\/ (?:Replace agent built-in header|Activate jelly theme)[\s\S]*?ctx\.ui\.setHeader\([\s\S]*?\}\)\);\s*\}/;
    if (OLD_HEADER.test(src)) {
      src = src.replace(OLD_HEADER, '// setHeader removed — branding via setStatus only (fixes stacking border bug)');
      ok("setHeader: removed (stops ┌────────────────────┐ stacking on every reply)");
      extChanged = true;
    } else {
      // Broader fallback: just remove the setHeader call block
      const BROAD = /if \(ctx\.hasUI\) \{[\s\S]*?ctx\.ui\.setHeader\([\s\S]*?\}\)\);\s*\}/;
      if (BROAD.test(src)) {
        src = src.replace(BROAD, '// setHeader removed — branding via setStatus only');
        ok("setHeader: removed via broad match (stops stacking border bug)");
        extChanged = true;
      } else {
        inf("setHeader: pattern not matched — may already be removed");
      }
    }
  } else {
    inf("setHeader: not present — border fix already applied");
  }

  // ── Add: Telegram + Discord bridge + new features ─────────────────────────
  if (!src.includes('_tgPoll') || !src.includes('send_telegram')) {
    console.log("\n  \x1b[93m⚠\x1b[0m  Your extensions/jellyos.ts is missing the Telegram/Discord bridge,");
    console.log("      trading journal, price alerts, snapshot command, and other new features.");
    console.log("      Download a fresh copy of JellyOS from Replit to get all new features,");
    console.log("      or copy extensions/jellyos.ts from the latest release.\n");
    console.log("      The critical border fix has been applied above. Recompiling now...\n");
  } else {
    inf("Telegram/Discord bridge: already present");
  }

  const missing = [];
  if (!src.includes('"run_shell"'))  missing.push("run_shell");
  if (!src.includes('"open_app"'))   missing.push("open_app");
  if (!src.includes('"read_file"'))  missing.push("read_file");
  if (!src.includes('"write_file"')) missing.push("write_file");
  if (missing.length > 0) {
    const TOOLS = `
  // ── Tools: Local system ────────────────────────────────────────────────────

  agent.registerTool({
    name: "run_shell",
    label: "Run Shell Command",
    description: "Execute a shell command on the local machine and return stdout/stderr.",
    parameters: Type.Object({
      command: Type.String({ description: "Shell command to execute" }),
      cwd:     Type.Optional(Type.String({ description: "Working directory" })),
      confirm: Type.Optional(Type.Boolean({ description: "Required for destructive commands" })),
      timeout: Type.Optional(Type.Number({ description: "Timeout ms (default 15000)" })),
    }),
    async execute(_id, params) {
      const { execSync } = require("node:child_process");
      const DESTRUCTIVE = /\\b(rm|rmdir|mv|kill|pkill|killall|sudo|chmod|chown|dd|mkfs|format|shutdown|reboot|truncate|shred)\\b/;
      if (DESTRUCTIVE.test(params.command) && !params.confirm) {
        return text(\`⚠️ Confirmation required for: \${params.command}\\nCall again with confirm: true.\`);
      }
      try {
        const stdout = execSync(params.command, { cwd: params.cwd ?? process.cwd(), timeout: params.timeout ?? 15_000, encoding: "utf-8", stdio: ["pipe","pipe","pipe"] });
        return text((stdout ?? "").trim() || "(no output)");
      } catch (err) {
        const msg = (err.stdout ?? "") + (err.stderr ? \`\\nstderr: \${err.stderr}\` : "");
        return text(\`Exit \${err.status ?? 1}:\\n\${msg.trim() || err.message}\`);
      }
    },
  });

  agent.registerTool({
    name: "open_app",
    label: "Open App / URL",
    description: "Open an application, file, or URL on the local machine.",
    parameters: Type.Object({
      target: Type.String({ description: "App name, file path, or URL" }),
      app:    Type.Optional(Type.String({ description: "Specific app to open with (macOS -a flag)" })),
    }),
    async execute(_id, params) {
      const { execSync } = require("node:child_process");
      const platform = process.platform;
      let cmd;
      if (platform === "darwin") {
        cmd = params.app ? \`open -a \${JSON.stringify(params.app)} \${JSON.stringify(params.target)}\` : \`open \${JSON.stringify(params.target)}\`;
      } else if (platform === "win32") {
        cmd = \`start "" \${JSON.stringify(params.target)}\`;
      } else {
        cmd = \`xdg-open \${JSON.stringify(params.target)}\`;
      }
      try { execSync(cmd, { timeout: 8000, stdio: "pipe" }); return text(\`Opened: \${params.target}\`); }
      catch (err) { return text(\`Failed to open \${params.target}: \${err.message}\`); }
    },
  });

  agent.registerTool({
    name: "read_file",
    label: "Read File",
    description: "Read a file from the local filesystem",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or ~ path to the file" }),
      max_bytes: Type.Optional(Type.Number({ description: "Max bytes (default 32768)" })),
    }),
    async execute(_id, params) {
      const os2 = require("node:os");
      const { readFileSync, statSync, existsSync } = require("node:fs");
      const rp = params.path.replace(/^~/, os2.homedir());
      if (!existsSync(rp)) return text(\`File not found: \${rp}\`);
      if (statSync(rp).isDirectory()) return text(\`\${rp} is a directory — use run_shell with ls\`);
      const raw = readFileSync(rp), maxBytes = params.max_bytes ?? 32_768;
      const content = raw.slice(0, maxBytes).toString("utf-8");
      return text(content + (raw.length > maxBytes ? \`\\n[truncated — \${raw.length} bytes total]\` : ""));
    },
  });

  agent.registerTool({
    name: "write_file",
    label: "Write File",
    description: "Write or append content to a file on the local filesystem",
    parameters: Type.Object({
      path:    Type.String({ description: "Absolute or ~ path" }),
      content: Type.String({ description: "Content to write" }),
      mode:    Type.Optional(Type.String({ description: "'overwrite' (default) or 'append'" })),
      confirm: Type.Optional(Type.Boolean({ description: "Required when overwriting an existing file" })),
    }),
    async execute(_id, params) {
      const os2 = require("node:os"), path2 = require("node:path");
      const { writeFileSync, appendFileSync, existsSync, mkdirSync } = require("node:fs");
      const rp = params.path.replace(/^~/, os2.homedir());
      const mode = params.mode ?? "overwrite";
      if (mode === "overwrite" && existsSync(rp) && !params.confirm) {
        return text(\`⚠️ \${rp} already exists. Call again with confirm: true to overwrite.\`);
      }
      mkdirSync(path2.dirname(rp), { recursive: true });
      if (mode === "append") { appendFileSync(rp, params.content, "utf-8"); return text(\`Appended to \${rp}\`); }
      writeFileSync(rp, params.content, "utf-8"); return text(\`Written to \${rp}\`);
    },
  });
`;
    const lastBrace = src.lastIndexOf("}");
    src = src.slice(0, lastBrace) + TOOLS + "\n}";
    fs.writeFileSync(extPath, src, "utf-8");
    ok(`Local system tools injected: ${missing.join(", ")}`);
    extChanged = true;
  } else {
    inf("Local system tools already present");
    // Still write if the render fix changed the file
    if (extChanged) fs.writeFileSync(extPath, src, "utf-8");
  }
} else {
  err("extensions/jellyos.ts not found");
}

// ── 7. Recompile extension ────────────────────────────────────────────────────
console.log("\n  Compiling extensions/jellyos.ts → extensions/jellyos.mjs ...");
try {
  const mjs = path.join(ROOT, "extensions", "jellyos.mjs");
  if (fs.existsSync(mjs)) fs.rmSync(mjs);
  execSync(
    `npx esbuild extensions/jellyos.ts --bundle --platform=node --format=esm ` +
    `--external:ws --external:@jellyos/agent --external:ethers --external:@solana/web3.js ` +
    `--external:alchemy-sdk --external:argon2 --external:uuid ` +
    `"--banner:js=import { createRequire } from 'module'; const require = createRequire(import.meta.url);" ` +
    `--outfile=extensions/jellyos.mjs`,
    { cwd: ROOT, stdio: "inherit" }
  );
  ok("Compiled → extensions/jellyos.mjs");
} catch (e) {
  err(`Compile failed: ${e.message}`);
}

console.log("\n\x1b[92m\x1b[1m  All patches applied.\x1b[0m");
console.log("  Run:  \x1b[1mjellyos setup\x1b[0m   — generate wallets and enter API keys");
console.log("  Run:  \x1b[1mjellyos\x1b[0m         — start the agent\n");
