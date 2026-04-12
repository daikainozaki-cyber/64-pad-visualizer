#!/bin/bash

# 64 Pad Explorer デプロイスクリプト（GitHub Actions代替）
# 使い方: ./deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Xserver接続情報
SSH_KEY="$HOME/.ssh/xserver.key"
SSH_HOST="xs071284.xsrv.jp"
SSH_PORT="10022"
SSH_USER="xs071284"
REMOTE_PATH="~/murinaikurashi.com/public_html/apps/64-pad/"
PUBLIC_URL="https://murinaikurashi.com/apps/64-pad/"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== 64 Pad Explorer デプロイ ===${NC}"

# ブランチチェック: main 以外からのデプロイを防止
CURRENT_BRANCH="$(git -C "${SCRIPT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
if [[ "${CURRENT_BRANCH}" != "main" ]]; then
    echo -e "${RED}❌ エラー: main ブランチ以外からのデプロイは禁止です${NC}"
    echo -e "${RED}   現在のブランチ: ${CURRENT_BRANCH}${NC}"
    echo -e "${RED}   git checkout main してからやり直してください${NC}"
    exit 1
fi

# テスト実行
if command -v npm &> /dev/null && [[ -f "${SCRIPT_DIR}/package.json" ]]; then
    echo -e "${BLUE}🧪 テスト実行中...${NC}"
    cd "$SCRIPT_DIR"
    npm test
    echo ""
fi

# note RSS からバナー更新
echo -e "${BLUE}📰 noteバナー更新中...${NC}"
if python3 "${SCRIPT_DIR}/tools/update_note_banner.py"; then
    echo -e "${GREEN}✅ バナー更新完了${NC}"
else
    echo -e "${RED}⚠️  バナー更新スキップ（既存テキスト維持）${NC}"
fi
echo ""

# デプロイ実行
echo -e "${BLUE}📤 デプロイ中...${NC}"
rsync -avz \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='CLAUDE.md' \
    --exclude='deploy.sh' \
    --exclude='config.sh' \
    --exclude='*.bak' \
    --exclude='tests' \
    --exclude='node_modules' \
    --exclude='package*.json' \
    --exclude='vitest.config.*' \
    --exclude='pad-core/tests' \
    --exclude='pad-core/node_modules' \
    --exclude='pad-core/package*.json' \
    --exclude='pad-core/vitest.config.*' \
    --exclude='pad-core/CLAUDE.md' \
    -e "ssh -i ${SSH_KEY} -p ${SSH_PORT}" \
    "${SCRIPT_DIR}/" \
    "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}"

echo ""
echo -e "${GREEN}✅ デプロイ完了${NC}"
echo -e "${GREEN}🌐 URL: ${PUBLIC_URL}${NC}"
