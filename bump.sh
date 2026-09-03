#!/bin/bash
# 改完前端跑這支再 commit：把 index.html 裡的 ?v= 換成現在時間，
# 學員的瀏覽器才會立刻拿到新的 css/js（GitHub Pages 預設快取 10 分鐘）。
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M)
sed -i '' -E "s|(href=\"css/board\.css)(\?v=[0-9]+)?\"|\1?v=$V\"|" index.html
sed -i '' -E "s|(src=\"js/config\.js)(\?v=[0-9]+)?\"|\1?v=$V\"|" index.html
sed -i '' -E "s|(src=\"js/board\.js)(\?v=[0-9]+)?\"|\1?v=$V\"|" index.html
sed -i '' -E "s|(href=\"favicon\.svg)(\?v=[0-9]+)?\"|\1?v=$V\"|" index.html
echo "版本戳 → $V"
grep -n "?v=$V" index.html
