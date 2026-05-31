#!/usr/bin/env bash
# Install japonette on a 42 cluster machine (or any host where you can't
# `npm install -g` without sudo).
#
# 42 cluster PCs ship Node locked to an old version (e.g. 12.22.9), which
# japonette can't use — it relies on the global `fetch` added in Node 18.
# So this script:
#   * if the system Node is ≥ 18, just redirects npm's global prefix to a
#     user-writable dir (~/.npm-global) and installs there;
#   * otherwise bootstraps a modern Node via nvm (fully user-space, no
#     sudo) and installs under that.
# Idempotent — safe to re-run.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/sakemyali/japonette/main/scripts/cluster-install.sh | bash
#
# Or, after cloning:
#   ./scripts/cluster-install.sh

set -eu

REQUIRED_MAJOR=18
NVM_VERSION="v0.40.1"
# Not named PREFIX: nvm refuses to run when a PREFIX variable is set.
NPM_GLOBAL="$HOME/.npm-global"
BIN_DIR="$NPM_GLOBAL/bin"
PATH_LINE='export PATH="$HOME/.npm-global/bin:$PATH"'

if [ -t 1 ]; then
  GREEN=$'\033[32m'
  RED=$'\033[31m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
else
  GREEN=""; RED=""; DIM=""; RESET=""
fi

say()  { printf '%s\n' "$*"; }
ok()   { printf '%s\n' "${GREEN}✓${RESET} $*"; }
die()  { printf '%s\n' "${RED}✗${RESET} $*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required but not found."

node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

# Install (if needed) and activate a modern Node LTS via nvm, in user space.
ensure_modern_node_via_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # nvm aborts if a PREFIX / npm_config_prefix is set in the environment.
  unset PREFIX npm_config_prefix 2>/dev/null || true
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    say "Installing nvm ($NVM_VERSION) to manage a user-local Node (no sudo)…"
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash
  else
    ok "nvm already installed at $NVM_DIR"
  fi
  # nvm.sh references unset variables, which trips `set -u`; relax around it.
  set +u
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts >/dev/null
  nvm alias default 'lts/*' >/dev/null
  set -u
  ok "Node $(node --version) active via nvm"
}

# --- pick a Node ------------------------------------------------------------

MAJOR="$(node_major)"
USED_NVM=0
if [ "$MAJOR" -ge "$REQUIRED_MAJOR" ]; then
  ok "Node $(node --version) detected (≥ $REQUIRED_MAJOR)"
else
  if [ "$MAJOR" -eq 0 ]; then
    say "No Node found on PATH."
  else
    say "Node $(node --version) is too old for japonette (needs ≥ $REQUIRED_MAJOR)."
    say "${DIM}The cluster's locked Node can't run japonette — bootstrapping a newer one.${RESET}"
  fi
  ensure_modern_node_via_nvm
  USED_NVM=1
fi

command -v npm >/dev/null 2>&1 || die "npm not found even after Node setup."

# --- install japonette ------------------------------------------------------

if [ "$USED_NVM" -eq 1 ]; then
  # nvm's Node has a user-writable global prefix, and nvm's installer already
  # appended its load block to your shell rc — so future shells get this Node
  # and the global bin automatically. No prefix redirect needed.
  say ""
  say "Installing japonette…"
  npm install -g japonette
  JBIN="$(command -v japonette 2>/dev/null || echo "$(npm prefix -g)/bin/japonette")"
else
  # System Node ≥ 18: its global dir may be root-owned, so redirect npm's
  # prefix to a user-writable location and persist it on PATH.
  mkdir -p "$BIN_DIR"

  CURRENT_PREFIX="$(npm config get prefix 2>/dev/null || echo "")"
  if [ "$CURRENT_PREFIX" != "$NPM_GLOBAL" ]; then
    npm config set prefix "$NPM_GLOBAL"
    ok "set npm prefix → $NPM_GLOBAL"
  else
    ok "npm prefix already $NPM_GLOBAL"
  fi

  # Persist PATH in every shell rc the user might have. Idempotent: only
  # appended once (we grep for the same line first).
  persist_path() {
    rc="$1"
    [ -f "$rc" ] || return 0
    if grep -Fq "$PATH_LINE" "$rc" 2>/dev/null; then
      return 0
    fi
    {
      printf '\n# Added by japonette cluster-install.sh — user-local npm prefix\n'
      printf '%s\n' "$PATH_LINE"
    } >> "$rc"
    ok "added PATH export to $(basename "$rc")"
  }
  persist_path "$HOME/.zshrc"
  persist_path "$HOME/.bashrc"
  persist_path "$HOME/.profile"

  # Make the binary visible to this shell session right now.
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) export PATH="$BIN_DIR:$PATH" ;;
  esac

  say ""
  say "Installing japonette…"
  npm install -g japonette
  JBIN="$BIN_DIR/japonette"
fi

say ""
INSTALLED_VERSION="$("$JBIN" --version 2>/dev/null || echo unknown)"
ok "japonette installed (v$INSTALLED_VERSION) → $JBIN"
say ""
say "${DIM}Open a new terminal (or run \`source ~/.zshrc\`) so PATH picks up,${RESET}"
say "${DIM}then start with:${RESET}"
say "  japonette login"
