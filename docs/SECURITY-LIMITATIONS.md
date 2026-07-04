# GitHub Cloud Signing — Security Limitations (V6)

This document describes the **accepted security model** for SiteScop V6 GitHub Cloud Signing. It applies to the frozen architecture using GitHub Pages for display and the SiteScop desktop app for authenticated writes.

## What is secured

| Asset | Location | Exposure |
|-------|----------|----------|
| GitHub Personal Access Token (PAT) | SiteScop desktop only (encrypted in user settings) | **Not** shipped to browser or GitHub Pages |
| Signature submission | Desktop signing relay (`/api/sign/:token`) | PAT used only on desktop when mirroring to GitHub |
| Repo writes (pending/signed/viewed JSON) | Desktop app via GitHub API | Requires PAT on inspector machine |

The client signing page (`docs/sign/app.js`) uses **public raw GitHub URLs** to read pending agreements and **POSTs signatures to the desktop relay**. No secrets are embedded in client-side JavaScript.

## Remaining limitations

### 1. Public pending agreement data

Pending agreement JSON files live in a **public GitHub repository** under `agreements/pending/`. Anyone who obtains the signing link (URL + token query parameter) can:

- Read client name, email, property address, pricing, and legal text preview
- Attempt to sign if they can reach the desktop signing relay

**Mitigation today:** Treat signing links as capability URLs — share only with the intended client. Use unguessable access tokens (SiteScop generates these).

**Not mitigated in V6:** Repo-wide read access if someone enumerates or leaks tokens; no server-side access control on pending JSON.

### 2. Same Wi‑Fi requirement (current phase)

Signature submission goes to the inspector's PC at `http://<LAN-IP>:38765/api/sign/<token>`. The client device must be on the **same local network** and SiteScop must be **running** with the signing server active.

**Impact:** Clients on mobile cellular data cannot complete signing in this phase unless a future public relay is configured (field reserved in settings, not used now).

### 3. Desktop relay trust model

The signing relay accepts POST requests from any origin (CORS `*`) on the local network. There is no separate client authentication beyond possession of the signing token.

**Impact:** Anyone on the same Wi‑Fi who knows or guesses the token could submit a signature. Tokens are UUID-like and not published in the repo path listing, but links forwarded in email/SMS could be intercepted on the client device.

### 4. GitHub repository visibility

If the cloud signing repo is **public**, agreement metadata in `agreements/pending/`, `agreements/signed/`, and `agreements/viewed/` is readable via raw GitHub URLs without authentication.

**Mitigation:** Use a private repo if GitHub plan allows private Pages, or accept that agreement metadata is stored in a dedicated signing repo separate from application source.

### 5. PAT scope on inspector machine

The PAT grants whatever repository permissions were assigned when created. A compromised inspector PC or leaked settings file could expose the PAT.

**Mitigation:** Use a fine-grained PAT limited to the single signing repo with Contents read/write only. Rotate if ever exposed. SiteScop encrypts the token via OS keychain when available.

### 6. No tamper-evident audit trail in V6

GitHub commit history provides a coarse audit log, but there is no independent timestamping or legal-grade non-repudiation layer in this version.

### 7. Sync latency

The desktop app polls GitHub every 60 seconds for signed/viewed files. A signature may appear in SiteScop up to one minute after the client submits (immediate locally via relay; GitHub mirror is best-effort).

## Revoked / prohibited pattern

**Do not** place a GitHub PAT in `docs/sign/config.js` or any file served by GitHub Pages. Previous versions that did so fully exposed the token to the public internet. Revoke any token that was ever committed or deployed that way.

## Related documents

- [E2E test checklist](./E2E-TEST.md)
- [Future improvements](https://github.com/sitescop/sitescop-v6/blob/main/docs/GITHUB-CLOUD-SIGNING-FUTURE-IMPROVEMENTS.md) (SiteScop V6 repository)
