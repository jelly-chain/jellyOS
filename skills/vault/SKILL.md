---
name: vault
description: Manage the AES-256-GCM encrypted profit vault — sweep profits, check balance, review history
---

# JellyOS Vault Skill

The profit vault is an AES-256-GCM encrypted store that secures realized trading profits. It requires a passphrase to unlock.

## Vault Operations

- `vault_status` — check current balance and lock state
- `vault_sweep` — move profits in (requires `confirm: true`)
- `vault_history` — review recent entries

## Vault Discipline

The vault exists to separate realized profits from trading capital. Follow these rules:

1. **Sweep after every profitable trade** — don't leave profits exposed in the trading account
2. **Lock after use** — vault should be locked (`/lock`) when not actively managing
3. **Never sweep unrealized** — only sweep after position is closed and settled
4. **Track reason** — always include a descriptive `note` when sweeping (e.g., "ETH long closed +18%")

## Setup

First-time vault creation: the user must set a passphrase. This passphrase is the only way to unlock the vault — it is NOT stored anywhere. If lost, vault data is unrecoverable.

```
/unlock — enter passphrase to unlock
/lock   — lock vault immediately
/vault  — show current status
```

## Security Notes

- Encryption: AES-256-GCM with scrypt KDF (N=16384, r=8, p=1)
- Storage: `~/.jelly/vault/profits.vault` (gitignored)
- The vault file is safe to back up — it is encrypted at rest
