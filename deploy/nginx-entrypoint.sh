#!/bin/sh
set -e

# Render / Railway 等雲端會注入 $PORT；本機 Docker Compose 預設 80
LISTEN_PORT="${PORT:-80}"

sed "s/listen 80;/listen ${LISTEN_PORT};/" /etc/nginx/conf.d/default.conf > /tmp/nginx.conf
mv /tmp/nginx.conf /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
