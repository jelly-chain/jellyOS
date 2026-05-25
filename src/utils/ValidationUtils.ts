interface SchemaRule {
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
}

export class ValidationUtils {
  static isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static isValidUrl(url: string): boolean {
    try { new URL(url); return true; }
    catch { return false; }
  }

  static isValidNumber(value: any): boolean {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  static isValidInteger(value: any, min?: number, max?: number): boolean {
    if (!Number.isInteger(value)) return false;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  }

  static isValidPort(value: any): boolean {
    return this.isValidInteger(value, 1, 65535);
  }

  static isValidPercentage(value: number): boolean {
    return this.isValidNumber(value) && value >= 0 && value <= 100;
  }

  static isValidTransactionHash(hash: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(hash);
  }

  static isValidSolanaAddress(address: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  static isValidEthereumAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }

  static validateConfig(config: any, schema: Record<string, SchemaRule>): string[] {
    const errors: string[] = [];
    for (const [key, rules] of Object.entries(schema)) {
      const value = config[key];
      if (rules.required && value === undefined) {
        errors.push(`${key} is required`);
        continue;
      }
      if (value !== undefined) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${key} must be of type ${rules.type}`);
        }
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${key} must be >= ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${key} must be <= ${rules.max}`);
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${key} has invalid format`);
        }
        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(`${key} must be one of: ${rules.enum.join(', ')}`);
        }
      }
    }
    return errors;
  }

  static sanitize(input: string): string {
    return input.replace(/[<>&'"]/g, '');
  }

  static truncate(str: string, maxLength: number): string {
    return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
  }

  static toSafeNumber(value: any, fallback: number = 0): number {
    const num = Number(value);
    return isNaN(num) ? fallback : num;
  }

  static isJsonString(str: string): boolean {
    try { JSON.parse(str); return true; }
    catch { return false; }
  }

  static isNonEmptyString(value: any): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  static isValidDate(value: any): boolean {
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime());
  }

  static isFutureDate(value: any): boolean {
    return this.isValidDate(value) && new Date(value).getTime() > Date.now();
  }

  static validateOrder(order: any): string[] {
    const errors: string[] = [];
    if (!order.symbol) errors.push('symbol is required');
    if (!['buy', 'sell'].includes(order.side)) errors.push('side must be buy or sell');
    if (!['market', 'limit', 'stop'].includes(order.type)) errors.push('type must be market, limit, or stop');
    if (order.quantity <= 0) errors.push('quantity must be positive');
    if (order.type === 'limit' && !order.price) errors.push('price is required for limit orders');
    if (order.type === 'stop' && !order.stopPrice) errors.push('stopPrice is required for stop orders');
    return errors;
  }
}