# Free always-on hosting for MGM HMS

Free database: the app keeps its database in one file (SQLite) on the server's own disk, so no separate database service is needed. Daily backups are copied to a second folder and kept 30 days.

## 1. Create the free server (you do this once)
1. Sign up at https://www.oracle.com/cloud/free/ (Always Free tier; a card is asked for verification only).
2. Create a compute instance: Ubuntu 22.04 or 24.04, shape "VM.Standard.A1.Flex" (Always Free), 2 OCPU, 8 GB RAM.
3. Download the SSH key it generates, and note the public IP address.
4. In the instance's security list / firewall, allow ports 22, 80 and 443 (keep 4300 closed).

## 2. Free web address
1. Go to https://www.duckdns.org, sign in, create a name such as `mgmhms`. Point it at the server IP.
2. Replace `hms.example.duckdns.org` in `Caddyfile` with your name.

## 3. Install (I run these once you give me the IP and SSH key)
- Install Node.js 24, Caddy, and copy the project to `/opt/mgm-hms`.
- `npm ci --omit=dev`, copy `data/` (the database) from this PC, and set the admin password.
- `sudo cp hms.service /etc/systemd/system/ && sudo systemctl enable --now hms`
- `sudo cp Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`
- Cron: `0 2 * * * /opt/mgm-hms/deploy/free-server/backup.sh`

## Notes
- Oracle can reclaim Always Free machines that stay idle for a long time; a hospital in daily use does not look idle.
- Free database limits are not reached at this size (one hospital, a few thousand patients per year).
- Change every default password before real patients are entered.
