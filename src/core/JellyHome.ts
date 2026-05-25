import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const HOME = resolve(homedir(), '.jellyos');

const DIRS = [
  'agents',
  'backups',
  'cache',
  'checkpoints',
  'memory/agents',
  'memory/market',
  'plans',
  'sessions',
  'skills',
  'tasks',
];

const JELLYOS_MD = `# JellyOS

AI blockchain analytics and trading agent.
https://github.com/jelly-chain/JellyOS · https://jellychain.fun

## Directory layout

| Path              | Contents                                      |
|-------------------|-----------------------------------------------|
| agents/           | Sub-agent scratch files and work artefacts    |
| backups/          | Vault and wallet backups                      |
| cache/            | Context store and API response cache          |
| checkpoints/      | Agent state checkpoints for revival           |
| memory/agents/    | Per-agent long-term memory                    |
| memory/market/    | Historical market snapshots per symbol        |
| plans/            | Agent-generated trade plans                   |
| sessions/         | REPL conversation sessions                    |
| skills/           | Loaded strategy skill definitions             |
| tasks/            | Persistent task queue                         |
| .env              | API keys and runtime config                   |
| JELLYOS.md        | This file                                     |
| history.jsonl     | Full conversation history                     |
| settings.json     | User preferences                              |

## Quick reference

\`\`\`
jelly              — start REPL
jelly setup        — re-run setup wizard
jelly --level max  — start in MAX effect mode
\`\`\`

## Effect levels

| Level  | Sub-agents | Description                  |
|--------|-----------|-------------------------------|
| eco    | 1         | Single model, minimal cost    |
| normal | 2         | Balanced (default)            |
| turbo  | 3         | Faster, more parallel calls   |
| max    | 5         | Full swarm, highest quality   |
`;

export class JellyHome {
  static init(): void {
    if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true });

    for (const dir of DIRS) {
      const full = resolve(HOME, dir);
      if (!existsSync(full)) mkdirSync(full, { recursive: true });
    }

    const mdPath = resolve(HOME, 'JELLYOS.md');
    if (!existsSync(mdPath)) writeFileSync(mdPath, JELLYOS_MD, 'utf-8');

    const histPath = resolve(HOME, 'history.jsonl');
    if (!existsSync(histPath)) writeFileSync(histPath, '', 'utf-8');

    const settingsPath = resolve(HOME, 'settings.json');
    if (!existsSync(settingsPath)) {
      writeFileSync(settingsPath, JSON.stringify({
        effectLevel: 'normal',
        theme: 'dark',
        dashboardPort: 4320,
        autoVault: true,
      }, null, 2), 'utf-8');
    }
  }

  static path(...parts: string[]): string {
    return resolve(HOME, ...parts);
  }
}
