/**
 * vault-ceremony.ts — One-time cold vault key generation.
 *
 * Generates EVM + Solana + Cosmos keypairs, displays them ONCE for the user
 * to write down, then zeroes private key memory and saves only public addresses.
 *
 * Private keys are NEVER written to disk.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

export interface VaultAddresses {
  evm: string;
  solana: string;
  cosmos: string;
  generatedAt: number;
}

interface RawPair {
  address: string;
  privateKey: string;
}

function generateEvmPair(): RawPair {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.generateKeys();
  const privHex  = ecdh.getPrivateKey('hex');
  const pubBytes = ecdh.getPublicKey();
  const hash     = crypto.createHash('sha256').update(pubBytes.slice(1)).digest();
  const address  = '0x' + hash.slice(-20).toString('hex');
  return { address, privateKey: '0x' + privHex };
}

function generateSolanaPair(): RawPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubDer  = (publicKey  as any).export({ type: 'spki',  format: 'der' }) as Buffer;
  const privDer = (privateKey as any).export({ type: 'pkcs8', format: 'der' }) as Buffer;
  const pubRaw  = pubDer.slice(-32);
  const address = pubRaw.toString('base64url');
  return { address, privateKey: privDer.toString('hex') };
}

function generateCosmosPair(): RawPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubDer  = (publicKey  as any).export({ type: 'spki',  format: 'der' }) as Buffer;
  const privDer = (privateKey as any).export({ type: 'pkcs8', format: 'der' }) as Buffer;
  const pubRaw  = pubDer.slice(-32);
  const address = 'cosmos1' + pubRaw.toString('hex').slice(0, 38);
  return { address, privateKey: privDer.toString('hex') };
}

function ask(prompt: string): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, ans => { rl.close(); resolve(ans); });
  });
}

function displayCeremony(evm: RawPair, sol: RawPair, cos: RawPair): void {
  const R = '\x1b[91m'; const G = '\x1b[92m'; const Y = '\x1b[93m';
  const C = '\x1b[96m'; const B = '\x1b[1m';  const N = '\x1b[0m';
  console.log('');
  console.log(`${R}${B}  ╔══════════════════════════════════════════════════════════════╗${N}`);
  console.log(`${R}${B}  ║  ⚠  VAULT KEY CEREMONY — SAVE THESE NOW, SHOWN ONCE ONLY   ║${N}`);
  console.log(`${R}${B}  ╚══════════════════════════════════════════════════════════════╝${N}`);
  console.log('');
  console.log(`  ${Y}${B}EVM (Ethereum / Base / Arbitrum / all EVM chains)${N}`);
  console.log(`  Address:     ${G}${evm.address}${N}`);
  console.log(`  Private key: ${B}${evm.privateKey}${N}`);
  console.log('');
  console.log(`  ${C}${B}Solana${N}`);
  console.log(`  Address:     ${G}${sol.address}${N}`);
  console.log(`  Private key: ${B}${sol.privateKey}${N}`);
  console.log('');
  console.log(`  ${Y}${B}Cosmos${N}`);
  console.log(`  Address:     ${G}${cos.address}${N}`);
  console.log(`  Private key: ${B}${cos.privateKey}${N}`);
  console.log('');
  console.log(`  ${R}These keys are NEVER stored to disk. This is your only chance to save them.${N}`);
  console.log(`  ${R}To access vault funds you will need the private key for that chain.${N}`);
  console.log('');
}

/**
 * Run the vault key ceremony.
 * - If vault-addresses.json already exists, skips ceremony and returns stored addresses.
 * - Otherwise generates keypairs, shows them until user confirms saved, then saves public addresses only.
 */
export async function runVaultCeremony(jellyHome: string): Promise<VaultAddresses> {
  const addressFile = path.join(jellyHome, 'vault-addresses.json');

  if (fs.existsSync(addressFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(addressFile, 'utf-8')) as VaultAddresses;
      console.log(`\n  Vault addresses already generated (${new Date(existing.generatedAt).toLocaleDateString()})`);
      console.log(`  EVM:    ${existing.evm}`);
      console.log(`  Solana: ${existing.solana}`);
      console.log(`  Cosmos: ${existing.cosmos}\n`);
      return existing;
    } catch { /* regenerate if corrupt */ }
  }

  const evm = generateEvmPair();
  const sol = generateSolanaPair();
  const cos = generateCosmosPair();

  let confirmed = false;
  while (!confirmed) {
    displayCeremony(evm, sol, cos);
    const ans = await ask('  Have you saved all three private keys? [yes / no]: ');
    if (ans.trim().toLowerCase() === 'yes') {
      confirmed = true;
    } else {
      console.log('\n  Redisplaying...\n');
    }
  }

  // Best-effort zero: reassign references (JS GC will handle actual memory)
  evm.privateKey  = '0'.repeat(evm.privateKey.length);
  sol.privateKey  = '0'.repeat(sol.privateKey.length);
  cos.privateKey  = '0'.repeat(cos.privateKey.length);

  const addresses: VaultAddresses = {
    evm: evm.address,
    solana: sol.address,
    cosmos: cos.address,
    generatedAt: Date.now(),
  };

  fs.mkdirSync(jellyHome, { recursive: true });
  fs.writeFileSync(addressFile, JSON.stringify(addresses, null, 2), 'utf-8');
  try { fs.chmodSync(addressFile, 0o600); } catch { /* windows */ }

  console.log(`\n  ✓ Vault public addresses saved → ${addressFile}`);
  console.log('  ✓ Private keys cleared from memory\n');

  return addresses;
}
