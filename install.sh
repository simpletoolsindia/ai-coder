#!/usr/bin/env bash
# AI By - one-line installer for macOS, Linux and WSL.
#
# Docs:      https://simpletoolsindia.github.io/ai-coder/
# GitHub:    https://github.com/simpletoolsindia/ai-coder
# npm:       https://www.npmjs.com/package/ai-by
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.sh | bash -s -- --version 0.2.1
#   curl -fsSL ... | bash -s -- --from-source   # install from a local checkout
#
# What it does:
#   1. Detects OS and package manager.
#   2. Installs Node.js >= 20 if missing (uses nvm or the system package manager).
#   3. Installs AI By globally via npm.
#   4. Verifies the install.
set -euo pipefail

PACKAGE_NAME="ai-by"
NODE_MIN_MAJOR=20
INSTALL_DIR=""
VERSION="latest"

print_banner() {
  cat <<'BANNER'
   ___  __  __ ____          ____
  / _ |/ / / /_  __/______ / __/
 / __ |/ /_/ / / / -_) -_)\__ \
/_/ |_/____ /_/  \__/\__/____/

AI By installer
BANNER
}

log()  { printf "\033[36m[ai-by]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[ai-by]\033[0m %s\n" "$*" >&2; }
fail() { printf "\033[31m[ai-by]\033[0m %s\n" "$*" >&2; exit 1; }

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) echo "$(uname -m)" ;;
  esac
}

have() { command -v "$1" >/dev/null 2>&1; }

ensure_node() {
  if have node; then
    local major
    major=$(node -p "parseInt(process.versions.node.split('.')[0], 10)")
    if [ "$major" -ge "$NODE_MIN_MAJOR" ]; then
      log "Node $(node --version) is already installed"
      return
    fi
    warn "Node $major found but >= $NODE_MIN_MAJOR required"
  fi
  if have nvm; then
    log "Installing Node via nvm"
    nvm install --lts
    nvm use --lts
    return
  fi
  local os="$1"
  case "$os" in
    macos)
      if have brew; then
        log "Installing Node via Homebrew"
        brew install node@20
        brew link --overwrite --force node@20
      else
        fail "Node >= $NODE_MIN_MAJOR is required. Install Homebrew (https://brew.sh) or Node manually."
      fi
      ;;
    linux)
      if have apt-get; then
        log "Installing Node via apt"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
      elif have dnf; then
        log "Installing Node via dnf"
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo dnf install -y nodejs
      elif have pacman; then
        log "Installing Node via pacman"
        sudo pacman -S --noconfirm nodejs npm
      else
        fail "Could not detect a package manager. Install Node >= $NODE_MIN_MAJOR} manually."
      fi
      ;;
    windows)
      if have winget; then
        log "Installing Node via winget"
        winget install -e --id OpenJS.NodeJS.LTS
      elif have choco; then
        log "Installing Node via choco"
        choco install -y nodejs-lts
      else
        fail "Install Node >= $NODE_MIN_MAJOR manually from https://nodejs.org"
      fi
      ;;
  esac
  have node || fail "Node installation failed"
  log "Node $(node --version) installed"
}

ensure_npm() {
  if ! have npm; then
    log "Installing npm"
    case "$1" in
      linux)
        sudo apt-get install -y npm || sudo dnf install -y npm || sudo pacman -S --noconfirm npm
        ;;
      macos)
        brew install npm
        ;;
      windows)
        choco install -y npm
        ;;
    esac
  fi
  have npm || fail "npm installation failed"
}

install_package() {
  log "Installing $PACKAGE_NAME@$VERSION from npm"
  if [ -n "$INSTALL_DIR" ]; then
    npm install -g "$INSTALL_DIR" --silent
  else
    if [ "$VERSION" = "latest" ]; then
      npm install -g "$PACKAGE_NAME" --silent
    else
      npm install -g "$PACKAGE_NAME@$VERSION" --silent
    fi
  fi
}

verify() {
  if have ai-coder; then
    log "ai-coder $(ai-coder --version 2>/dev/null || echo 'installed')"
    log "Run 'ai-coder' to start"
  else
    warn "ai-coder was installed but is not on PATH"
    warn "Restart your terminal or run: hash -r"
  fi
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --global) shift ;;
      --version) VERSION="$2"; shift 2 ;;
      --from-source) INSTALL_DIR="$(pwd)"; shift ;;
      --help|-h) cat <<'USAGE'
Usage: install.sh [--version v] [--from-source]
USAGE
        exit 0 ;;
      *) warn "Unknown argument: $1"; shift ;;
    esac
  done
}

main() {
  print_banner
  parse_args "$@"
  local os
  os=$(detect_os)
  log "Detected OS: $os / $(detect_arch)"
  ensure_node "$os"
  ensure_npm "$os"
  install_package
  verify
  log "Done."
}

main "$@"
