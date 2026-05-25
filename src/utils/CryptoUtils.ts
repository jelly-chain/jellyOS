import { randomBytes, createHash } from 'crypto';

export class CryptoUtils {
  static generateKey(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  static generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `${timestamp}-${random}`;
  }

  static hash(data: string | object, algorithm: string = 'sha256'): string {
    const input = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash(algorithm).update(input).digest('hex');
  }

  static hashWithSalt(data: string, salt: string): string {
    return this.hash(data + salt);
  }

  static generateApiKey(): string {
    return `jelly_${randomBytes(24).toString('hex')}`;
  }

  static generateSecret(): string {
    return randomBytes(48).toString('hex');
  }

  static maskString(input: string, visibleChars: number = 4): string {
    if (input.length <= visibleChars) return input;
    const visible = input.slice(0, visibleChars);
    const masked = '*'.repeat(input.length - visibleChars);
    return `${visible}${masked}`;
  }

  static encrypt(text: string, key: string): string {
    const combined = key + text;
    return Buffer.from(combined).toString('base64');
  }

  static decrypt(encoded: string, key: string): string {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return decoded.startsWith(key) ? decoded.slice(key.length) : '';
  }

  static randomBetween(min: number, max: number): number {
    const range = max - min;
    const randomValue = randomBytes(4).readUInt32LE(0) / 0xFFFFFFFF;
    return min + randomValue * range;
  }

  static generateNonce(): string {
    return randomBytes(16).toString('hex');
  }

  static isValidHex(str: string): boolean {
    return /^[0-9a-fA-F]+$/.test(str);
  }

  static isPrivateKey(str: string): boolean {
    return str.length === 64 && this.isValidHex(str);
  }

  static isAddress(str: string): boolean {
    return str.startsWith('0x') && str.length === 42 && this.isValidHex(str.slice(2));
  }

  static checksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}

export const crypto = new CryptoUtils();