# GitHub Cloud Signing — End-to-End Test Checklist

Use this checklist to validate the complete signing workflow after deploying the secure portal.

## Prerequisites

- [ ] **GitHub Pages enabled** on `sitescop/sitescop-cloud-signing`: Settings → Pages → Source **Deploy from branch** → Branch **main** → Folder **/docs**
- [ ] Portal live at: `https://sitescop.github.io/sitescop-cloud-signing/sign/`
- [ ] `docs/sign/config.js` committed (owner/repo/branch only — **no PAT**)
- [ ] SiteScop V6 running on inspector PC (`npm run dev` or installed build)
- [ ] **Client phone/tablet on the same Wi‑Fi** as the inspector PC
- [ ] GitHub PAT created (fine-grained, Contents read/write on `sitescop-cloud-signing` only), stored in SiteScop Settings only

## SiteScop configuration

Open **Settings → GitHub Cloud Signing** and set:

| Field | Value |
|-------|-------|
| Enable | ✓ |
| Owner | `sitescop` |
| Repository | `sitescop-cloud-signing` |
| Branch | `main` |
| Pages URL | `https://sitescop.github.io/sitescop-cloud-signing/sign/` |
| Public Relay URL | *(leave empty for this phase)* |
| PAT | Your fine-grained token |

Click **Test Connection** → expect success with default branch `main`.  
Click **Save Settings**.

## Test flow

### Step 1 — Create and send agreement

1. Log in to SiteScop (`inspector@sitescop.com.au` / `SiteScop2026!` in dev).
2. Create a test agreement (or use an existing DRAFT).
3. Click **Send** on the agreement detail page.
4. Confirm signing mode shows **GitHub** (not local Wi‑Fi only).
5. Copy the signing URL — format:  
   `https://sitescop.github.io/sitescop-cloud-signing/sign/?token=<uuid>`

**Verify on GitHub:** Repo contains `agreements/pending/<token>.json` with `publicView` and `submitEndpoints.lan` pointing to `http://<LAN-IP>:38765/api/sign/<token>`.

### Step 2 — Client opens link (same Wi‑Fi)

1. On phone, open the signing URL in Safari/Chrome.
2. Agreement loads with client details and legal sections.
3. If you see *"Missing config.js"* or load errors, wait 1–2 minutes for Pages deploy and confirm `config.js` exists on `main`.

### Step 3 — Client signs

1. Enter full name, draw signature, accept declarations.
2. Tap **Sign and submit**.
3. Expect **Agreement signed** success screen.

**If signing fails:**

- Confirm SiteScop is still open on the PC.
- Confirm phone is on same Wi‑Fi (not mobile data).
- Open `http://<PC-LAN-IP>:38765/health` from phone browser — expect `{"ok":true,...}`.
- Check `submitEndpoints.lan` in pending JSON matches PC IP (re-send agreement if IP changed).

### Step 4 — Desktop sync

1. Return to SiteScop agreement detail (within ~60 seconds).
2. Status should move to **VIEWED** then **SIGNED** after sync.
3. Generate/open signed PDF if available.

**Verify on GitHub:**

- `agreements/viewed/<token>.json` exists
- `agreements/signed/<token>.json` exists with signature data

### Step 5 — Negative checks

- [ ] View page source / Network tab on signing page — **no** `ghp_` tokens or `Authorization: Bearer` headers to GitHub API from browser.
- [ ] `https://sitescop.github.io/sitescop-cloud-signing/sign/config.js` contains only owner/repo/branch.

## Quick health URLs

Replace `<LAN-IP>` with your PC's local IP (shown in SiteScop or `ipconfig`):

```
http://<LAN-IP>:38765/health
https://sitescop.github.io/sitescop-cloud-signing/sign/
https://raw.githubusercontent.com/sitescop/sitescop-cloud-signing/main/agreements/pending/<token>.json
```

## Pass criteria

All of the following must be true:

1. Client loads agreement from GitHub Pages without errors.
2. Client submits signature successfully on same Wi‑Fi.
3. SiteScop records VIEWED and SIGNED status.
4. Signed JSON appears in GitHub repo.
5. No PAT visible in browser or public repo files.
