#!/bin/bash
set -eu
cd /var/www/nexara-app 2>/dev/null || cd /opt/nexara-app 2>/dev/null || cd /root/NEXARA-app 2>/dev/null || { find /var/www /opt /home -maxdepth 3 -type d -name 'nexara*' 2>/dev/null | head -10; exit 1; }
pwd
git fetch origin mejora/calidad-y-web
git checkout mejora/calidad-y-web
git pull --ff-only origin mejora/calidad-y-web
git log -1 --oneline
if [ -x deploy/update.sh ]; then
  DEPLOY_BRANCH=mejora/calidad-y-web ./deploy/update.sh --force-all
elif [ -x update-server.sh ]; then
  ./update-server.sh
else
  echo "no update script"
  ls deploy | head
fi
