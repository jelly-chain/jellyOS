export { AuthMiddleware } from './AuthMiddleware';
export { RateLimitMiddleware, RateLimitConfig } from './RateLimitMiddleware';

export class MiddlewareStack {
  private auth: AuthMiddleware;
  private rateLimit: RateLimitMiddleware;

  constructor() {
    this.auth = new AuthMiddleware();
    this.rateLimit = new RateLimitMiddleware();
  }

  getAuth(): AuthMiddleware { return this.auth; }
  getRateLimit(): RateLimitMiddleware { return this.rateLimit; }
}

export const middleware = new MiddlewareStack();