# MGM HMS — local hospital server setup

This installation runs inside the hospital without Firebase, Supabase, AWS, an
internet connection, or a logged-in Windows user. One server holds the application,
SQLite database and uploaded reports. Reception, doctors, pharmacy and laboratory
open its LAN address in a browser. Do not put a separate database on each workstation.

Internet failure does not stop the application. Server power, disk or LAN failure
will still interrupt access. This is a single-server installation, not a redundant
cluster or a workstation-offline synchronization system.

## 1. Prepare the server

- Use a dedicated Windows 11 Pro or supported Windows Server computer with SSD
  storage, wired Ethernet and a UPS. Start with 8 GB RAM; size storage for uploaded
  scans and test representative concurrent users before hospital rollout.
- Reserve its IP in the router/DHCP server, for example `192.168.1.10`. Avoid IP
  conflicts. Give it a recognizable hostname such as `HMS-SERVER`.
- Set Windows date/time and timezone correctly. This application uses the server's
  local date for visits, receipts and daily charges.
- Disable automatic sleep/hibernate while plugged in through Windows Power settings.
  Configure BIOS “restore power after AC loss” and UPS shutdown with your technician.
  Plan Windows updates/reboots outside patient service hours; do not disable updates.
- Keep database files on a local SSD, not a shared folder, OneDrive or a mapped drive.
  Only the server process should access the database. Staff connect using the browser.
- Use a second physical disk for backups if available. Another folder on the same
  disk does not protect against disk failure. Rotate an encrypted offline copy offsite.

## 2. Copy the offline installation

Use the supplied `MGM-HMS-Local-*` release folder. Copy the complete folder to
`C:\MGMHMS` on the hospital server. It includes a tested Node 24 runtime,
application dependencies and prebuilt CSS, so the hospital does **not** need to run
`npm install`, download packages, or keep a development terminal open.

If building a release on the developer computer, run from the repository:

```powershell
npm run build:css
npm test
node tools/local-server-test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\deployment\Build-OfflinePackage.ps1
```

The release deliberately excludes hospital data, uploads, logs and server-specific
configuration. Keep `release-manifest.json` with the package. Restrict write access
to application/runtime/deployment files to the server administrator.

## 3. Install once, from Administrator PowerShell

For a **new hospital**:

```powershell
cd C:\MGMHMS
.\deployment\Install-LocalServer.ps1 `
  -DataDir 'C:\ProgramData\MGMHMS\data' `
  -BackupDir 'D:\MGMHMS-Backups' `
  -InitializeNewHospital -OpenLanFirewall
```

Replace `D:` with a real, available local backup drive. If PowerShell blocks the
script, run `powershell -NoProfile -ExecutionPolicy Bypass -File` followed by the
same script and arguments for this installation; do not change global policy.

For **existing hospital data**, omit `-InitializeNewHospital` and point `-DataDir`
at the existing data directory. On the present development machine that is
`E:\MGM HMS\data`. Do not initialize a new database when you intend to retain records.
The installer makes a verified backup before the service starts or migrates it.

To migrate to another machine, create a verified backup using step 6, copy its
complete folder and restore using step 7. Do **not** copy only a running SQLite
`.db` file: recent writes may still be in its WAL file.

The installer refuses occupied ports and existing task/configuration names. Stop
the previous HMS instance deliberately during maintenance before installing. It
does not kill unrelated processes or replace data. If installation fails midway,
inspect the error and existing config/task before retrying; preserve both data and backups.

It creates Windows Task Scheduler task **MGM-HMS-Server**, running as the built-in
**Local Service** account. It starts at boot without a staff login. A five-minute
trigger checks that the supervisor exists; running instances are not duplicated.
The supervisor restarts a crashed app with backoff, and restarts an unresponsive
app after three failed 15-second health checks. Continuous startup failure is
logged and needs an administrator to fix its cause.

The optional firewall rule permits only the configured TCP port on Private/Domain
networks from the local subnet. It does not open the server to the public internet.
If workstations use routed VLANs, ask IT to allow only those hospital subnets.

## 4. Connect the desks

- Server: `http://localhost:4300`
- Other computers/tablets on the hospital LAN: `http://192.168.1.10:4300`
  (replace the example IP with the server's reserved IP).
- Create desktop/browser shortcuts. `localhost` on a reception computer refers to
  that reception computer, **not** the server.
- Change the initial `admin / surely` and every other seeded account password in
  Users & Roles before staff use. Configure hospital details, tariff, users,
  permissions, counters and opening stock; review/remove remaining sample patients.
- This installer serves HTTP. For encrypted LAN traffic, have IT configure an
  internal HTTPS reverse proxy and trusted certificate, including `/ws` WebSocket
  forwarding. Set `HMS_TRUST_PROXY=1` only when using a trusted loopback proxy.
  Do not forward port 4300 from the internet.

## 5. Daily checks and normal operation

```powershell
cd C:\MGMHMS
.\deployment\Server-Status.ps1
```

Configuration: `C:\ProgramData\MGMHMS\server-config.json`

Logs: `C:\ProgramData\MGMHMS\logs\server.log` (10 MB rotation; five archives)

Status: `C:\ProgramData\MGMHMS\logs\status.json`, showing the latest supervisor
state and backup result. Check its timestamp; a stale status file is not proof of
health. `/api/health` checks the running server and a database read; it is not a
substitute for testing a clinical workflow or checking free disk space.

Staff can close their browsers and log out of Windows. The server continues.
It cannot continue while the server is shut down. Use UPS protection and maintain
free disk space. Review backup errors daily; the app stays available if backup
fails, so a backup failure must not be ignored.

## 6. Backups

Automatic backups run when the supervisor starts and every six hours thereafter.
By default the latest **28 completed snapshots** are retained (about seven days
at four daily backups, fewer days if the server restarts frequently). Each includes:

- A SQLite online database snapshot, verified with integrity and foreign-key checks.
- Every uploaded file referenced by that snapshot, including soft-deleted files.
- A manifest with SHA-256 checksums for the database and attachments.

A failed backup remains `.partial`, is never reported as successful, and does not
prune good snapshots. Investigate/remove failed partials during maintenance after
checking the logs and completing a new valid backup. They can otherwise consume disk.

Make an extra backup before every application update:

```powershell
& 'C:\MGMHMS\runtime\node.exe' 'C:\MGMHMS\deployment\backup.mjs' `
  'C:\ProgramData\MGMHMS\server-config.json'
```

Copy completed backup folders to a separately protected/offline drive. Backup
folders contain patient data; restrict access and use disk encryption. This
installation does not automatically replicate backups off the server. Up to six
hours of work can be lost if the primary disk fails between successful backups.

## 7. Restore without overwriting live data

Verify and restore to a **new** directory:

```powershell
cd C:\MGMHMS
.\deployment\Restore-Backup.ps1 `
  -Backup 'D:\MGMHMS-Backups\hms-REPLACE-WITH-ACTUAL-FOLDER' `
  -Destination 'C:\ProgramData\MGMHMS\restored-data'
```

The tool validates checksums/integrity and copies only manifest-listed files.
It refuses an existing destination. It does not change the running server.

During an agreed maintenance window, Administrator PowerShell:

```powershell
Disable-ScheduledTask -TaskName 'MGM-HMS-Server'
Stop-ScheduledTask -TaskName 'MGM-HMS-Server'
```

Wait until the application health URL no longer responds and confirm no owned HMS
process remains. Keep the old data directory intact. Change `dataDir` in
`server-config.json` to the restored directory, then grant service access:

```powershell
icacls 'C:\ProgramData\MGMHMS\restored-data' /grant '*S-1-5-19:(OI)(CI)M' /T
Enable-ScheduledTask -TaskName 'MGM-HMS-Server'
Start-ScheduledTask -TaskName 'MGM-HMS-Server'
.\deployment\Server-Status.ps1
```

Check patient records, payments and attached reports before reopening desks.
For rollback, disable/stop again and point `dataDir` back to the preserved directory
using a compatible application version. Do not merge two independently used databases.

## 8. Updating and troubleshooting

Before updates: verify a fresh backup, schedule downtime, disable/stop the task,
and save the old application folder. Copy the new release to the application
location, preserving external data/config/backups. Re-enable/start and run the
acceptance checks below. Never run `npm run reset` on a hospital server.

| Symptom | Check |
|---|---|
| Server works, reception cannot connect | Correct server IP, wired LAN, Private/Domain firewall profile, TCP port and VLAN rules |
| Port in use | Existing HMS or another service; inspect `Get-NetTCPConnection -LocalPort 4300`; do not kill by port blindly |
| Missing database | Data drive connected, configured path correct, Local Service permissions; restore deliberately instead of creating an empty hospital |
| Task starts then exits | Task Scheduler Last Run Result, Node runtime path, config, read/write permissions, `server.log` |
| Database busy | A second app instance or maintenance tool is using the database; use one server process |
| Backup failed | Free space, backup drive availability, missing uploaded file, integrity error; preserve good backups |
| Old screen after update | Reload the browser; application JS/CSS/HTML now revalidate instead of using a week-long cache |
| Supervisor lock blocks start | Confirm the recorded PID and task are stopped before removing a stale lock; never remove an active lock |

## 9. Acceptance checklist before handover

1. Disconnect internet while leaving the LAN connected. Log in from two desks,
   register a test patient, record payment and confirm live updates.
2. Reboot the hospital server. Without logging into Windows, confirm a workstation
   can log in and sees the same records.
3. Test the supervisor recovery in a maintenance window using only its recorded
   server PID, then confirm records persist. Never stop unrelated Node processes.
4. Make and restore a backup to a spare directory/server, including a report file.
5. Test printer output, counter permissions, simultaneous users and UPS behavior.
6. Record the IP, data/backup locations, administrator contact and recovery procedure.

The automated deployment test covers isolated startup, crash recovery, missing-DB
protection, duplicate-port refusal, backups, checksums and restore. Real Windows
boot behavior, service ACLs, UPS and hospital network access require these onsite checks.

Implementation references: [Node SQLite backup API](https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html)
and [Windows Task Scheduler settings](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings).
