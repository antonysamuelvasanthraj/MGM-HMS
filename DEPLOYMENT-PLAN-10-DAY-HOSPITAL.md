# MGM HMS — always-on hosting plan (for the hospital's daily work)

Goal: the hospital works every day from its own desks, whether or not the office PC is on, at low monthly cost, with patient data kept safe.

## What the application needs

The HMS is one Node.js program with a single SQLite database file (`data/surelyhms.db`) and live updates over WebSocket. Any host must keep that process running all the time and keep the data file on a disk that survives restarts.

## Options compared

| Option | Works when the PC is off | Monthly cost (approx., check the provider's price page) | Effort | Verdict |
|---|---|---|---|---|
| **A. Small Linux server (VPS) in India** | Yes | about USD 6–12 (roughly ₹500–1,000) | About 1 day, once | **Recommended.** Runs the existing app unchanged. |
| B. Office PC kept on, with UPS and auto-start | Only while the PC is on | Electricity and a UPS | Half a day | Fine for a trial, not for 10 days of live work. |
| C. Vercel with a hosted Postgres database (Vercel's database offering) | Yes | Low at small scale | Several weeks | **Not recommended.** Vercel runs short-lived functions; this app needs a permanent process, a file database and live updates. It would be a rewrite of the data layer. |

"Versal" in your message is most likely Vercel. Its free and low tiers cannot run this application as it is built.

## Recommended setup (Option A)

1. **Server:** a VPS with 2 vCPU, 2–4 GB RAM and 40 GB SSD, in an Indian region (e.g. Mumbai or Bengaluru) so patient data stays in India and the desks are fast.
2. **Software:** Ubuntu LTS, Node.js 24, the app from the private Git repository, run as a `systemd` service with `Restart=always`, so it restarts after a crash or a reboot.
3. **Web address and HTTPS:** a domain (about ₹800–1,000 a year) pointed at the server, with Caddy in front for automatic HTTPS. Desks use `https://hms.<yourdomain>`.
4. **Firewall:** only ports 22 (SSH, your IP only), 80 and 443 open. Port 4300 stays closed to the internet.
5. **Backups:**
   - the app already writes a verified backup bundle every day under `data/backups/`;
   - copy those bundles off the server every night to a second provider's storage (e.g. Backblaze B2 or a Google Drive folder), keeping 30 days;
   - test one restore before go-live (`deployment/Restore-Backup.ps1` or the Linux equivalent).
6. **Monitoring:** an uptime check (free tier of UptimeRobot or similar) that emails you if the site stops answering.
7. **Staff logins:** change every default password before go-live (the `admin` login still has `surely`). Use the simple logins only for the first days.

## Steps for the next 10 days

| Day | Task | Who |
|---|---|---|
| 1 | Create the VPS and domain; note the server address. | You (needs your card and account) |
| 1 | Make the Git repository private and push the code (done — see below). | Me, with your GitHub login |
| 2 | Install the server, the service and HTTPS; run the regression tests on the server. | Me, with SSH access you give |
| 2 | Restore a copy of today's data to the server and check it. | Me |
| 3 | Set the real hospital masters: prices (Fees & Tariffs), lab ranges (validated by the lab in-charge), medicine stock (GRN), staff logins. | Hospital, with me |
| 3–4 | Test each desk with its own login. | Hospital |
| 5 | Go live: point the domain at the server; switch the public link; keep the old link working for one day. | Me and you |
| 5–10 | Daily checks: backup copied, uptime alert quiet, one restore test by day 10. | You, 5 minutes a day |

## Before real patients

- Delete demo patients and bills (done on the current live copy, with a backup).
- Deactivate the "Demo Doc" login, and duplicate Lipid Profile test (LAB-LIP / LAB-LIPID).
- Set real passwords for every login. Do not keep the simple onboarding passwords.
- Price every new lab test and package in Fees & Tariffs; unpriced ones cannot be billed.
- Check that every lab range is validated by the lab in-charge (see the lab manual).
- Confirm data-protection responsibilities under India's DPDP Act 2023 with the hospital's legal adviser.

## What I cannot do for you

- Buy the server or the domain: these need your card and account login. Tell me which provider you choose and I will set everything up once you give me SSH access.
- Make the Git repository private from here if the GitHub command-line tool is not installed; you can do it in one step on GitHub (see the message).
