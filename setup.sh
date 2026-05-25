#!/usr/bin/env bash
# JellyOS setup — installs @jellyos/agent, clones Jelly Skills, runs wizard
set -e

# ── Colours ───────────────────────────────────────────────────────────────────
CY='\033[96m'; GD='\033[93m'; GR='\033[92m'; RD='\033[91m'
GY='\033[90m'; BD='\033[1m';  DM='\033[2m';  NC='\033[0m'

JELLY_HOME="${JELLYOS_HOME:-$HOME/.jelly}"
JELLY_SKILLS="$JELLY_HOME/skills"
YES_ALL=0
[[ "$*" == *"--yes"* ]] && YES_ALL=1

# ── ASCII header ──────────────────────────────────────────────────────────────
echo ""
echo -e "${CY}${BD}"
echo '     ██╗███████╗██╗     ██╗  ██╗   ██╗  ██████╗ ███████╗'
echo '     ██║██╔════╝██║     ██║  ╚██╗ ██╔╝ ██╔═══██╗██╔════╝'
echo '     ██║█████╗  ██║     ██║   ╚████╔╝  ██║   ██║███████╗'
echo ' ██  ██║██╔══╝  ██║     ██║    ╚██╔╝   ██║   ██║╚════██║'
echo ' ╚█████╔╝███████╗███████╗███████╗██║   ╚██████╔╝███████║'
echo '  ╚════╝ ╚══════╝╚══════╝╚══════╝╚═╝    ╚═════╝ ╚══════╝'
echo ""
echo -e "${NC}${GD}${BD}  Autonomous DeFi Trading Agent${NC}"
echo -e "${GY}  v2.0  ·  Jelly Skills${NC}"
echo ""

# ── Helpers ───────────────────────────────────────────────────────────────────
ask_yn() {
  local prompt="$1" default="${2:-Y}"
  [[ $YES_ALL -eq 1 ]] && echo -e "  ${GY}${prompt} → yes (--yes)${NC}" && return 0
  local yn
  read -rp "$(echo -e "  ${prompt} [Y/n]: ")" yn
  [[ -z "$yn" || "$yn" =~ ^[Yy] ]]
}

step() { echo -e "\n${CY}${BD}  ── $1 ──────────────────────────────────────────${NC}"; }

ok()   { echo -e "  ${GR}✓${NC} $1"; }
info() { echo -e "  ${GY}→${NC} $1"; }
warn() { echo -e "  ${GD}⚠${NC}  $1"; }
fail() { echo -e "  ${RD}✗${NC} $1"; }

# ── [1/6] Node.js check ───────────────────────────────────────────────────────
step "1/6  System check"
command -v node &>/dev/null || { fail "Node.js 20+ required: https://nodejs.org"; exit 1; }
NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
[ "$NODE_VER" -ge 20 ] || { fail "Node.js 20+ required. Found: $(node --version)"; exit 1; }
ok "Node.js $(node --version)"

command -v git &>/dev/null && ok "git $(git --version | head -1 | awk '{print $3}')" \
  || warn "git not found — skill installation will be skipped"
HAS_GIT=$(command -v git &>/dev/null && echo 1 || echo 0)

# ── [2/6] @jellyos/agent engine ──────────────────────────────────────────────
step "2/6  JellyOS agent engine"

# Silently remove Pi if present — ~/.jelly/ data is never touched
if [ -d "node_modules/@earendil-works" ]; then
  info "Removing legacy dependency..."
  npm uninstall @earendil-works/pi-coding-agent @earendil-works/pi-ai 2>/dev/null || true
  rm -rf node_modules/@earendil-works 2>/dev/null || true
  ok "Legacy dependency removed"
fi

# Also remove @jellychain/agent if present (old package name)
if [ -d "node_modules/@jellychain/agent" ]; then
  info "Removing old @jellychain/agent..."
  npm uninstall @jellychain/agent 2>/dev/null || true
  rm -rf node_modules/@jellychain 2>/dev/null || true
fi

# Install @jellyos/agent
if [ ! -d "node_modules/@jellyos/agent" ]; then
  info "Installing @jellyos/agent..."
  npm install @jellyos/agent --silent 2>/dev/null || \
  pnpm add @jellyos/agent --silent 2>/dev/null || true
fi

if [ -d "node_modules/@jellyos/agent" ]; then
  ok "@jellyos/agent installed"
else
  warn "@jellyos/agent install skipped — run manually: npm install @jellyos/agent"
fi

# ── [3/6] Dependencies ────────────────────────────────────────────────────────
step "3/6  Project dependencies"
npm install --silent
ok "Dependencies installed"

# Install dashboard dependencies if dashboard/ exists
if [ -d "dashboard" ] && [ -f "dashboard/package.json" ]; then
  info "Installing dashboard dependencies..."
  npm install --prefix dashboard --silent
  ok "Dashboard dependencies installed"
fi
chmod +x bin/jellyos 2>/dev/null || true
chmod +x bin/jelly-config 2>/dev/null || true

# Compile extension to ESM .mjs so @jellyos/agent can load it via dynamic import()
# --bundle inlines ../src/* locally; npm packages stay as ESM imports (resolved at runtime)
info "Compiling extension..."
if npx esbuild --version &>/dev/null 2>&1; then
  npx esbuild extensions/jellyos.ts \
    --bundle \
    --platform=node \
    --format=esm \
    --external:ws \
    --external:@jellyos/agent \
    --external:ethers \
    --external:@solana/web3.js \
    --external:alchemy-sdk \
    --external:argon2 \
    --external:uuid \
    "--banner:js=import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
    --outfile=extensions/jellyos.mjs 2>/dev/null && \
    ok "Extension compiled (extensions/jellyos.mjs)" || \
    warn "esbuild failed. Run manually:
    npx esbuild extensions/jellyos.ts --bundle --platform=node --format=esm --external:ws --external:@jellyos/agent --external:ethers --external:@solana/web3.js --external:alchemy-sdk --external:argon2 --external:uuid \"--banner:js=import { createRequire } from 'module'; const require = createRequire(import.meta.url);\" --outfile=extensions/jellyos.mjs"
else
  warn "esbuild not found — skipping compile. Run manually:
    npx esbuild extensions/jellyos.ts --bundle --platform=node --format=esm --external:ws --external:@jellyos/agent --external:ethers --external:@solana/web3.js --external:alchemy-sdk --external:argon2 --external:uuid \"--banner:js=import { createRequire } from 'module'; const require = createRequire(import.meta.url);\" --outfile=extensions/jellyos.mjs"
fi

# Optional global link
if ask_yn "Link 'jellyos' command globally? (adds to PATH)"; then
  npm link 2>/dev/null && ok "'jellyos' linked globally" || warn "npm link failed — run as sudo or skip"
else
  info "Skipped global link — run via: node bin/jellyos"
fi

# ── [4/6] Jelly Skills ────────────────────────────────────────────────────────
step "4/6  Jelly Skills"
mkdir -p "$JELLY_SKILLS"

SKILLS_REPO="https://github.com/jelly-chain/jelly-claude-skills"
SDK_REPO="https://github.com/jelly-chain/SDK"
TMP_SKILLS=""
TMP_SDK=""

install_skills() {
  local label="$1"; shift
  local skills=("$@")
  if [[ $HAS_GIT -eq 0 ]]; then warn "git not available — skipping ${label}"; return; fi

  if ask_yn "Install ${label} skills? (${skills[*]})"; then
    if [ -z "$TMP_SKILLS" ]; then
      TMP_SKILLS=$(mktemp -d)
      info "Cloning jelly-chain/jelly-claude-skills..."
      git clone --depth=1 --quiet "$SKILLS_REPO" "$TMP_SKILLS" 2>/dev/null \
        || { warn "Could not clone — check your internet connection"; TMP_SKILLS=""; return; }
    fi
    local count=0
    for skill in "${skills[@]}"; do
      local src="$TMP_SKILLS/skills/$skill"
      local dst="$JELLY_SKILLS/$skill"
      if [ -d "$src" ] && [ ! -d "$dst" ]; then
        cp -r "$src" "$dst"
        (( count++ )) || true
      elif [ -d "$dst" ]; then
        info "$skill already installed"
      fi
    done
    ok "Installed ${count} ${label} skill(s)"
  fi
}

# Batch A — Core trading (default yes)
install_skills "core trading" \
  coingecko-skill defillama-skill dexscreener-skill etherscan-skill \
  chainlink-skill 1inch-skill uniswap-skill gmx-skill hyperliquid-skill jelly-skill

# Batch B — Solana
install_skills "Solana" \
  helius-skill jupiter-skill raydium-skill meteora-skill \
  solana-trading-skill solana-wallet-skill solana-security-checklist \
  solana-common-errors solana-compatibility-matrix

# Batch C — Prediction markets
install_skills "prediction markets" \
  polymarket-skill kalshi-skill predict-fun-skill prediction-skill

# Batch D — BNB / Base
install_skills "BNB and Base" \
  bnb-trading-skill bnb-wallet-skill bnbchain-mcp-skill base-skill aave-skill

# SDK repo — knowledge skills only (no live code)
if [[ $HAS_GIT -eq 1 ]]; then
  if ask_yn "Install SDK knowledge skills? (prediction, sports, markets — docs only, no code)"; then
    TMP_SDK=$(mktemp -d)
    info "Cloning jelly-chain/SDK..."
    if git clone --depth=1 --quiet "$SDK_REPO" "$TMP_SDK" 2>/dev/null; then
      for sdk in FIFA-SDK SPORT-SDK Prediction-V2-main market-prediction-sdk-main; do
        local_name="$(echo "$sdk" | tr '[:upper:]' '[:lower:]')" # lowercase (portable)
        dst="$JELLY_SKILLS/$local_name"
        if [ -d "$TMP_SDK/$sdk" ] && [ ! -d "$dst" ]; then
          mkdir -p "$dst"
          # Copy README/docs as SKILL.md; ignore any package.json / node_modules
          find "$TMP_SDK/$sdk" -maxdepth 2 \( -name "*.md" -o -name "*.txt" \) \
            ! -path "*/node_modules/*" -exec cp {} "$dst/" \; 2>/dev/null || true
          # Create minimal SKILL.md if none found
          [ -f "$dst/SKILL.md" ] || echo "# ${sdk} — see README for API docs" > "$dst/SKILL.md"
          ok "SDK skill: $local_name"
        fi
      done
    else
      warn "Could not clone SDK repo"
    fi
  fi
fi

# Cleanup temp dirs
[ -n "$TMP_SKILLS" ] && rm -rf "$TMP_SKILLS"
[ -n "$TMP_SDK"    ] && rm -rf "$TMP_SDK"

SKILL_COUNT=$(find "$JELLY_SKILLS" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
ok "${SKILL_COUNT} Jelly Skill(s) installed in $JELLY_SKILLS"

# ── [5/6] Setup wizard (API keys + vault ceremony + wallets) ──────────────────
step "5/6  Configuration wizard"
node bin/jellyos setup

# ── [6/6] Permissions hardening ───────────────────────────────────────────────
step "6/6  Security hardening"
[ -f "$JELLY_HOME/.env" ]               && chmod 600 "$JELLY_HOME/.env"               && ok ".env permissions set (600)"
# vault-keys/ no longer created — private keys are never saved to disk
[ -d "$JELLY_HOME/wallets" ]            && chmod 700 "$JELLY_HOME/wallets"             && chmod 600 "$JELLY_HOME/wallets"/*.json   2>/dev/null; true
ok "File permissions hardened"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CY}${BD}  ══════════════════════════════════════════════${NC}"
echo -e "  ${GR}${BD}Setup complete!${NC}"
echo ""
echo -e "  Start agent:   ${BD}jellyos${NC}"
echo -e "  Update config: ${BD}jellyos config${NC}"
echo -e "  Help:          ${BD}jellyos --help${NC}"
echo -e "${CY}  ══════════════════════════════════════════════${NC}"
echo ""
