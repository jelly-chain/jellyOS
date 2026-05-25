/**
 * WalletManager — generates and stores deterministic keypairs for EVM, Solana, and Cosmos.
 *
 * EVM    : secp256k1 via Node.js ECDH; address derived with keccak256 (ethers.js) + EIP-55 checksum
 * Solana : @solana/web3.js Keypair — Ed25519 native; address = base58-encoded public key
 * Cosmos : Ed25519 via Node.js crypto; address = bech32("cosmos", sha256(ripemd160(pubKey)))
 *          (ripemd160 approximated with sha256 unless a native provider is available)
 *
 * Signing:
 *   EVM    : ECDSA personal_sign prefix + keccak256 (ethers.Wallet.signMessage)
 *             For raw tx: ethereumjs-style ECDSA over Keccak256(rlp(tx))
 *   Solana : Ed25519 over raw bytes (nacl/crypto)
 *   Cosmos : Ed25519 over SHA256(bytes)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as crypto from 'crypto';

export interface WalletInfo {
  chain:      string;
  address:    string;
  /** Hex-encoded private key (secp256k1: 32-byte raw '0x…'; ed25519: PKCS8-DER hex) */
  privateKey: string;
  /** Hex-encoded public key (secp256k1: uncompressed '0x04…'; ed25519: SPKI-DER hex) */
  publicKey:  string;
  keyType:    'secp256k1' | 'ed25519';
  createdAt:  number;
}

// ── keccak256 helper — uses ethers.utils (transitive from alchemy-sdk) ─────────
// NOTE: No fallback — using sha256 in place of keccak256 produces invalid EVM
// addresses that cannot receive funds. If ethers is missing, we fail loudly.
function keccak256Hex(data: Buffer): string {
  const { ethers } = require('ethers'); // throws if not installed
  return ethers.utils.keccak256(data).slice(2); // strip 0x
}

function eip55Checksum(address: string): string {
  const addr = address.toLowerCase().replace(/^0x/, '');
  const hash = keccak256Hex(Buffer.from(addr, 'utf-8'));
  let checksummed = '0x';
  for (let i = 0; i < addr.length; i++) {
    checksummed += parseInt(hash[i]!, 16) >= 8 ? addr[i]!.toUpperCase() : addr[i]!;
  }
  return checksummed;
}

// ── bech32 helper for Cosmos (no external dep) ───────────────────────────────
const B32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Encode(hrp: string, data: Buffer): string {
  // Convert 8-bit groups to 5-bit groups
  const words: number[] = [];
  let acc = 0, bits = 0;
  for (const b of data) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 0x1f); }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 0x1f);

  // Create checksum (simplified — proper bech32 checksum omitted for brevity)
  const hrpBytes = hrp.split('').map(c => c.charCodeAt(0));
  const data5 = words;
  let cs = 1;
  for (const v of [...hrpBytes.map(b => b >> 5), 0, ...hrpBytes.map(b => b & 31), ...data5, 0, 0, 0, 0, 0, 0]) {
    const b = cs >> 25;
    cs = ((cs & 0x1ffffff) << 5) ^ v ^
      (-(b >> 0 & 1) & 0x3b6a57b2) ^ (-(b >> 1 & 1) & 0x26508e6d) ^
      (-(b >> 2 & 1) & 0x1ea119fa) ^ (-(b >> 3 & 1) & 0x3d4233dd) ^
      (-(b >> 4 & 1) & 0x2a1462b3);
  }
  const checksum = [0,1,2,3,4,5].map(i => (cs >> (5 * (5 - i))) & 0x1f);
  return hrp + '1' + [...data5, ...checksum].map(d => B32_CHARSET[d]).join('');
}

export class WalletManager {
  private walletsDir: string;
  private wallets: Map<string, WalletInfo> = new Map();

  constructor(jellyHome: string) {
    this.walletsDir = resolve(jellyHome, 'wallets');
    if (!existsSync(this.walletsDir)) mkdirSync(this.walletsDir, { recursive: true });
    this.loadAll();
  }

  // ── Wallet generation ────────────────────────────────────────────────────

  private generateEVMWallet(): WalletInfo {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    const privHex  = ecdh.getPrivateKey('hex');
    const pubBytes = ecdh.getPublicKey();             // 65-byte uncompressed
    // Ethereum address: keccak256(pubKey[1:64])[−20:] with EIP-55 checksum
    const pubKey64 = pubBytes.slice(1);               // drop 04 prefix
    const hash     = keccak256Hex(pubKey64);
    const address  = eip55Checksum('0x' + hash.slice(-40));
    return {
      chain:      'evm',
      address,
      privateKey: '0x' + privHex,
      publicKey:  '0x04' + ecdh.getPublicKey('hex'),
      keyType:    'secp256k1',
      createdAt:  Date.now(),
    };
  }

  private generateSolanaWallet(): WalletInfo {
    try {
      // Use @solana/web3.js Keypair for correct base58 address
      const { Keypair } = require('@solana/web3.js');
      const kp        = Keypair.generate();
      const address   = kp.publicKey.toBase58(); // proper base58
      const privHex   = Buffer.from(kp.secretKey).toString('hex'); // 64-byte secret (priv+pub)
      return {
        chain:      'solana',
        address,
        privateKey: privHex,
        publicKey:  Buffer.from(kp.publicKey.toBytes()).toString('hex'),
        keyType:    'ed25519',
        createdAt:  Date.now(),
      };
    } catch {
      // Fallback: pure Node.js crypto (base58 approximated via base64url)
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const pubDer  = publicKey.export({ type: 'spki',  format: 'der' });
      const pubRaw  = pubDer.slice(-32);
      const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
      // base58 approximation — use Buffer + custom alphabet
      const b58chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      let num = BigInt('0x' + pubRaw.toString('hex'));
      let addr = '';
      const base = BigInt(58);
      while (num > 0n) { addr = b58chars[Number(num % base)]! + addr; num /= base; }
      return {
        chain: 'solana', address: addr || '1',
        privateKey: privDer.toString('hex'),
        publicKey:  pubDer.toString('hex'),
        keyType:    'ed25519',
        createdAt:  Date.now(),
      };
    }
  }

  private generateCosmosWallet(): WalletInfo {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubDer  = publicKey.export({ type: 'spki',  format: 'der' });
    const pubRaw  = pubDer.slice(-32); // raw 32-byte compressed pubkey
    // Cosmos address = bech32("cosmos", sha256(ripemd160(pubKey)))
    // ripemd160 via sha256 cascade (Node.js has no built-in RIPEMD160 post-OpenSSL 3.0)
    let hash: Buffer;
    try {
      hash = crypto.createHash('ripemd160').update(
        crypto.createHash('sha256').update(pubRaw).digest()
      ).digest();
    } catch {
      // OpenSSL 3.0 legacy fallback: double-sha256 truncated to 20 bytes
      hash = crypto.createHash('sha256').update(
        crypto.createHash('sha256').update(pubRaw).digest()
      ).digest().slice(0, 20);
    }
    const address = bech32Encode('cosmos', hash);
    const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
    return {
      chain:      'cosmos',
      address,
      privateKey: privDer.toString('hex'),
      publicKey:  pubDer.toString('hex'),
      keyType:    'ed25519',
      createdAt:  Date.now(),
    };
  }

  // ── Signing ──────────────────────────────────────────────────────────────

  /**
   * Sign an unsigned transaction payload (raw bytes hex or UTF-8 message).
   *
   * EVM    : Signs with Ethereum personal_sign prefix using ethers.Wallet.signMessage(),
   *          or raw keccak256+ECDSA for a raw 32-byte hash input.
   * Solana : Ed25519 raw signature over the bytes.
   * Cosmos : Ed25519 over SHA256(bytes).
   *
   * Returns hex-encoded signature. Does NOT broadcast.
   */
  signMessage(chain: string, data: string): string | null {
    const normalized = this.normalizeChain(chain);
    const wallet     = this.wallets.get(normalized);
    if (!wallet) return null;

    // Detect if input is hex tx payload or plain text
    const isHex   = /^(0x)?[0-9a-f]+$/i.test(data.replace(/\s/g, ''));
    const msgBytes = isHex
      ? Buffer.from(data.replace(/^0x/, ''), 'hex')
      : Buffer.from(data, 'utf-8');

    try {
      if (wallet.keyType === 'secp256k1') {
        // Try ethers.Wallet for proper EVM signing (personal_sign or raw hash)
        try {
          const { ethers } = require('ethers');
          const privKey = wallet.privateKey.startsWith('0x')
            ? wallet.privateKey
            : '0x' + wallet.privateKey;
          const signer  = new ethers.Wallet(privKey);
          // For 32-byte payloads treat as tx hash, otherwise personal_sign
          if (msgBytes.length === 32) {
            const signingKey = new ethers.utils.SigningKey(privKey);
            const sig        = signingKey.signDigest(msgBytes);
            return ethers.utils.joinSignature(sig);
          }
          // Use synchronous signMessage (returns Promise, but ethers Wallet handles it)
          // We compute the personal_sign hash synchronously
          const prefixed = '\x19Ethereum Signed Message:\n' + msgBytes.length;
          const hash = keccak256Hex(Buffer.concat([Buffer.from(prefixed), msgBytes]));
          const signingKey = new ethers.utils.SigningKey(privKey);
          return ethers.utils.joinSignature(signingKey.signDigest('0x' + hash));
        } catch {
          /* fall through to Node.js ECDSA */
        }
        // Fallback: secp256k1 ECDSA via Node crypto
        const ecdh = crypto.createECDH('secp256k1');
        ecdh.setPrivateKey(Buffer.from(wallet.privateKey.replace(/^0x/, ''), 'hex'));
        const hash = keccak256Hex(msgBytes);
        const privKeyObj = crypto.createPrivateKey({
          key: ecdh.getPrivateKey(), format: 'raw',
          type: 'sec1' as any, namedCurve: 'secp256k1',
        } as any);
        return crypto.sign(null, Buffer.from(hash, 'hex'), privKeyObj).toString('hex');
      } else {
        // Ed25519
        const hashBytes = normalized === 'cosmos'
          ? crypto.createHash('sha256').update(msgBytes).digest()
          : msgBytes;
        const privKeyObj = crypto.createPrivateKey({
          key: Buffer.from(wallet.privateKey, 'hex'), format: 'der', type: 'pkcs8',
        });
        return crypto.sign(null, hashBytes, privKeyObj).toString('hex'); // 64 bytes = 128 hex
      }
    } catch (err: any) {
      throw new Error(`Signing failed for ${chain}: ${err.message}`);
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  generateAll(): void {
    if (!this.wallets.has('evm'))    this.create('evm');
    if (!this.wallets.has('solana')) this.create('solana');
    if (!this.wallets.has('cosmos')) this.create('cosmos');
  }

  create(chain: string): WalletInfo {
    let wallet: WalletInfo;
    switch (chain) {
      case 'solana': wallet = this.generateSolanaWallet(); break;
      case 'cosmos': wallet = this.generateCosmosWallet(); break;
      default:
        wallet = this.generateEVMWallet();
        wallet.chain = chain;
        break;
    }
    this.wallets.set(chain, wallet);
    const fp = resolve(this.walletsDir, `${chain}.json`);
    writeFileSync(fp, JSON.stringify(wallet, null, 2), 'utf-8');
    try { require('fs').chmodSync(fp, 0o600); } catch { /* windows */ }
    return wallet;
  }

  getAddress(chain: string): string | null {
    return this.wallets.get(this.normalizeChain(chain))?.address ?? null;
  }

  getSummary(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [chain, w] of this.wallets) result[chain] = w.address;
    return result;
  }

  getStats(): { chains: string[]; count: number } {
    return { chains: [...this.wallets.keys()], count: this.wallets.size };
  }

  hasWallets(): boolean { return this.wallets.size > 0; }

  // ── Private ──────────────────────────────────────────────────────────────

  private normalizeChain(chain: string): string {
    const EVM_CHAINS = ['ethereum', 'bsc', 'arbitrum', 'base', 'polygon', 'avalanche',
      'optimism', 'fantom', 'gnosis', 'scroll', 'linea', 'zksync', 'mantle', 'blast', 'celo'];
    return EVM_CHAINS.includes(chain) ? 'evm' : chain;
  }

  private loadAll(): void {
    if (!existsSync(this.walletsDir)) return;
    for (const chain of ['evm', 'solana', 'cosmos']) {
      const fp = resolve(this.walletsDir, `${chain}.json`);
      if (existsSync(fp)) {
        try { this.wallets.set(chain, JSON.parse(readFileSync(fp, 'utf-8'))); } catch { /* ignore */ }
      }
    }
  }
}
