# SiteScop Cloud Signing

Public GitHub repository for **GitHub Cloud Signing** — agreement JSON storage and the client signing portal (GitHub Pages).

Repository: [github.com/sitescop/sitescop-cloud-signing](https://github.com/sitescop/sitescop-cloud-signing)

## Architecture (V6 — frozen)

| Component | Role |
|-----------|------|
| **SiteScop desktop** | Holds GitHub PAT; uploads pending agreements; runs local signing relay; syncs signed results |
| **This repo** | Stores `agreements/pending|signed|viewed/*.json`; hosts static signing UI via GitHub Pages |
| **Client browser** | Loads agreement from public raw GitHub URL; submits signature to desktop relay (same Wi‑Fi) |

**No secrets belong in this repository.** The Personal Access Token is configured only inside SiteScop Settings on the inspector's PC.

## Setup

1. Enable **GitHub Pages**: Settings → Pages → Deploy from branch **main**, folder **/docs**.
2. Portal URL: `https://sitescop.github.io/sitescop-cloud-signing/sign/`
3. `docs/sign/config.js` is committed with public values (`owner`, `repo`, `branch`) — edit if you fork this repo.
4. Configure SiteScop desktop: Settings → GitHub Cloud Signing (owner, repo, branch, Pages URL, PAT).

## Directory layout

```
docs/sign/          Client signing portal (GitHub Pages)
  app.js            Portal logic (no PAT)
  config.js         Public repo identity
  config.example.js Template for forks
  index.html
  style.css
agreements/
  pending/          Uploaded by SiteScop when agreement is sent
  signed/           Written by desktop after client signs via relay
  viewed/           Written by desktop when client opens link
```

## Documentation

- [Security limitations](./SECURITY-LIMITATIONS.md)
- [End-to-end test checklist](./E2E-TEST.md)
- [Operations guide (SiteScop V6)](https://github.com/sitescop/sitescop-v6/blob/main/docs/GITHUB-CLOUD-SIGNING-OPERATIONS.md) — daily workflow, troubleshooting, sign-off
- [Future improvements (hosted API migration)](https://github.com/sitescop/sitescop-v6/blob/main/docs/GITHUB-CLOUD-SIGNING-FUTURE-IMPROVEMENTS.md)

## Security reminder

If you ever placed a GitHub PAT in `config.js`, **revoke that token immediately** and use the current portal version where the PAT stays on the desktop only.
