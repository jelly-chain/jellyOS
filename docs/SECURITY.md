# JellyOS Security Guide

## Key Management

1. **API Keys** — Store in `.env.local` (gitignored). Never commit to version control.
2. **Private Keys** — Never stored in config files. Use environment variables only.
3. **Wallet Keys** — Stored in `wallets/` directory (gitignored). Encrypt at rest.

## Environment Security

- `.env.local` — Production secrets (gitignored)
- `.env.example` — Template without real values (committed)
- `config/secrets.json` — Additional secrets (gitignored)

## Network Security

1. **RPC Endpoints** — Use private RPC endpoints when possible
2. **Rate Limiting** — Built-in rate limiter prevents API abuse
3. **Authentication** — API token authentication for all endpoints
4. **Trading** — Trading is disabled by default, enable explicitly

## Best Practices

```
.env.local          ← Store real API keys here (gitignored)
.env.example        ← Template only (safe to commit)
config/config.json  ← Non-sensitive defaults (safe to commit)
```

1. Never share private keys or API secrets
2. Rotate API keys regularly
3. Use read-only API keys for monitoring
4. Enable trading only in controlled environments
5. Keep logs free of sensitive data
6. Use network isolation for production deployments

## Audit Logging

All sensitive operations are logged to `logs/audit.log`:
- Configuration changes
- Trade executions
- Agent state changes
- Authentication events
- Key operations