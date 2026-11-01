#!/bin/sh
# Daily copy of the database and uploads, kept 30 days. Run from cron as the ubuntu user.
set -e
DEST=/opt/mgm-hms-backups/$(date +%Y-%m-%d)
mkdir -p "$DEST"
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/opt/mgm-hms/data/surelyhms.db').exec(\"VACUUM INTO '$DEST/surelyhms.db'\")"
[ -d /opt/mgm-hms/data/uploads ] && cp -r /opt/mgm-hms/data/uploads "$DEST/"
find /opt/mgm-hms-backups -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
