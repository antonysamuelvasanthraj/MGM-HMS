# Remote client access to the local HMS

Prepared 3 October 2026. The application runs at http://localhost:4300 on this server. Remote access is not yet activated: no Tailscale or Cloudflare connector is installed or authenticated on this computer.

All browser clients use this same application and SQLite database. API calls use the browser's current hostname and live updates use its matching WebSocket hostname, so remote clients do not need code changes or a second database. Role permissions remain in force.

## Option 1 — private client access with Tailscale

1. Install Tailscale from https://tailscale.com/download/windows on the HMS server and the client's computer.
2. Sign the server into the hospital's Tailscale account. The client signs into their own authorised account.
3. On the server, enable private HTTPS forwarding from an administrator terminal:

   ```powershell
   & 'C:\Program Files\Tailscale\tailscale.exe' serve --bg http://127.0.0.1:4300
   & 'C:\Program Files\Tailscale\tailscale.exe' serve status
   ```

   Complete any account-level HTTPS enablement that Tailscale requests. Use the real HTTPS address printed by Serve; an address cannot be allocated before account authentication.
4. In Tailscale's Machines page, share only the HMS server with the client. Restrict their access policy to this server's HTTPS port 443. Do not give access to the hospital LAN, desktop, file shares or other server ports. Inspect existing grants because a broad rule can also allow access.
5. Client accepts the invitation, connects Tailscale, opens the HTTPS address followed by `/login`, and signs into an existing HMS account appropriate for the demonstration.
6. Test from the client's separate internet connection: login, role dashboard, allowed pages, live updates, patient/visit/bill links and report downloads. Confirm protected pages still reject accounts without permission.

This uses private Serve, not public Funnel. Device sharing can be revoked after the demonstration. The database remains on this computer; the remote session accesses its records over the network.

Official instructions: https://tailscale.com/docs/reference/tailscale-cli/serve and https://tailscale.com/docs/features/sharing.

## Option 2 — browser-only access through a domain

Use a hospital-controlled Cloudflare account/domain and a named Cloudflare Tunnel pointing to `http://127.0.0.1:4300`. Configure Cloudflare Access for the client's specific identity before publishing the hostname. Forward the entire application, including `/api`, `/ws` and authenticated files; retain the HMS login behind Access. Install the connector as a Windows service using the account's generated instructions. Do not paste connector tokens into this guide or commit them to the application.

The actual hostname, account authentication and allowed client identity are required to activate this option. No domain or connector credentials are currently configured. Official documentation: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/.

## Keep the local application running

The current demo runs as a background Node process; an automatic boot task has not been claimed as installed. The existing `deployment/Install-LocalServer.ps1` can install the supervisor and boot task. Use the existing `E:\MGM HMS\data` directory, omit `-InitializeNewHospital`, and follow `LOCAL-SERVER-GUIDE.md` during a planned server restart. Preserve demo logins and records. The remote connector and local application must both start unattended for continuing remote access.

Server electricity and internet must remain available for remote users. Local LAN access can continue when internet is unavailable, provided the server and LAN remain running. Prevent server sleep and use a UPS for the demonstration.

## Checks completed before connecting an external client

- Local health endpoint returns OK.
- 804 isolated workflow API checks passed, including registration, clinical orders, diagnostics, pharmacy, admissions, billing, payer settlement, accounting and role permission checks.
- Local server checks passed: startup, login/assets, missing-database protection, port conflict, crash recovery, backups, attachment restore, retention and graceful shutdown.
- API and WebSocket addresses follow the requested hostname rather than hard-coded localhost.
- Demo login credentials and business records were not reset.

These checks do not prove remote connectivity. A remote address, provider sign-in and test from an external client are still required.
