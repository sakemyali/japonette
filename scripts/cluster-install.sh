#!/usr/bin/env bash
# Install japonette on a 42 cluster machine (or any host where you can't
# `npm install -g` without sudo). Redirects npm's global install prefix to
# ~/.npm-global, persists ~/.npm-global/bin on PATH in your shell rc, then
# installs japonette. Idempotent — safe to re-run.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/sakemyali/japonette/main/scripts/cluster-install.sh | bash
#
# Or, after cloning:
#   ./scripts/cluster-install.sh

set -eu

PREFIX="$HOME/.npm-global"
BIN_DIR="$PREFIX/bin"
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

command -v npm  >/dev/null 2>&1 || die "npm is not installed. Install Node ≥ 18 first (e.g. via nvm)."
command -v node >/dev/null 2>&1 || die "node is not installed. Install Node ≥ 18 first (e.g. via nvm)."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 18 ] || die "Node ≥ 18 required, found $(node --version 2>/dev/null || echo unknown)."

mkdir -p "$BIN_DIR"

# Point npm's global install at the user-writable prefix.
CURRENT_PREFIX="$(npm config get prefix 2>/dev/null || echo "")"
if [ "$CURRENT_PREFIX" != "$PREFIX" ]; then
  npm config set prefix "$PREFIX"
  ok "set npm prefix → $PREFIX"
else
  ok "npm prefix already $PREFIX"
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

say ""
INSTALLED_VERSION="$("$BIN_DIR/japonette" --version 2>/dev/null || echo unknown)"
ok "japonette installed (v$INSTALLED_VERSION) → $BIN_DIR/japonette"
say ""
say "${DIM}Open a new terminal (or run \`source ~/.zshrc\`) so PATH picks up,${RESET}"
say "${DIM}then start with:${RESET}"
say "  japonette login"
