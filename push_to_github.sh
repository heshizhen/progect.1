#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/heshizhen/progect.1.git"

if [ ! -d ".git" ]; then
  git init
  git branch -M main
  git remote add origin "$REPO_URL"
fi

git pull origin main --rebase --allow-unrelated-histories || true
git add .
git commit -m "feat: add Day 1 spec and Day 2 Next.js MVP scaffold with 5 core pages" || true
git push -u origin main
echo "✅ 已成功推送到 $REPO_URL"
