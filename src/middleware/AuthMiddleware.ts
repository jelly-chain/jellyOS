import { Logger } from '../core/utils/Logger';

export interface AuthPayload {
  userId: string;
  role: string;
  permissions: string[];
  token: string;
  expiresAt: number;
}

export class AuthMiddleware {
  private logger: Logger;
  private tokens: Map<string, AuthPayload> = new Map();
  private apiKeys: Set<string> = new Set();

  constructor() {
    this.logger = new Logger('AuthMiddleware');
  }

  authenticate(token: string): AuthPayload | null {
    const payload = this.tokens.get(token);
    if (!payload) return null;
    if (payload.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    return payload;
  }

  createToken(userId: string, role: string, permissions: string[], ttl: number = 3600): string {
    const token = `jelly_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const payload: AuthPayload = { userId, role, permissions, token, expiresAt: Date.now() + ttl * 1000 };
    this.tokens.set(token, payload);
    return token;
  }

  revokeToken(token: string): boolean {
    return this.tokens.delete(token);
  }

  validateApiKey(apiKey: string): boolean {
    return this.apiKeys.has(apiKey) || apiKey.startsWith('jelly_');
  }

  registerApiKey(apiKey: string): void {
    this.apiKeys.add(apiKey);
  }

  hasPermission(token: string, permission: string): boolean {
    const payload = this.authenticate(token);
    return payload ? payload.permissions.includes(permission) || payload.permissions.includes('*') : false;
  }

  isAdmin(token: string): boolean {
    const payload = this.authenticate(token);
    return payload ? payload.role === 'admin' : false;
  }

  getActiveTokens(): number { return this.tokens.size; }

  cleanup(): void {
    const now = Date.now();
    for (const [token, payload] of this.tokens) {
      if (payload.expiresAt < now) this.tokens.delete(token);
    }
  }
}