---
inclusion: always
---

# Steve's Docker Deployment Context

## Current deployment

Steve runs Kiro Crew via Docker on a server behind a network that **blocks
`api.telegram.org` via DPI** (TCP connects but TLS handshake is dropped).

### Docker run command

```bash
docker run -d --name kirocrew \
  -e KIROCREW_ALLOW_UNSANDBOXED=1 \
  -e "TELEGRAM_API_BASE_URL=https://telegram-proxy.YOUR_SUBDOMAIN.workers.dev/bot{token}/{method}" \
  -p 5476:5476 \
  -v ~/kirocrew-data:/home/kirocrew \
  -v ~/kirocrew-patches/telegram/client.py:/usr/local/lib/python3.12/site-packages/kiro_crew/telegram/client.py:ro \
  -v ~/kirocrew-patches/dashboard/handlers/messaging.py:/usr/local/lib/python3.12/site-packages/kiro_crew/dashboard/handlers/messaging.py:ro \
  ghcr.io/kirodotdev/kirocrew:stable
```

### Key details

- **Dashboard URL:** configured via `dashboard.url` in config.json
- **Telegram proxy:** Cloudflare Worker reverse proxy to `api.telegram.org`
  - Deployed via `wrangler` OAuth login
- **Config on host:** `~/kirocrew-data/.kiro/crew/config.json`
- **Secrets on host:** `~/kirocrew-data/.kiro/crew/.env`
- **Patched files on host:** `~/kirocrew-patches/`

### Patches applied

Two source files are patched and bind-mounted (:ro) into the container to
support the `TELEGRAM_API_BASE_URL` environment variable (not in upstream):

1. `telegram/client.py` — `_API_BASE` reads from env var
2. `dashboard/handlers/messaging.py` — `_validate_telegram_token()` uses same env var

These patches will need re-applying if the upstream files change significantly
after a version upgrade.

### Networking constraints

- `api.telegram.org` is **blocked by DPI** on this network (TCP OK, TLS drops)
- All Telegram traffic goes through the Cloudflare Worker reverse proxy
- The dashboard is exposed at a custom domain, requiring `dashboard.url` in config
- Channel credential settings are **always read-only from the web dashboard** in
  Docker — edit via bind mount (`~/kirocrew-data/`) or `docker exec`

### Common operations

```bash
# Restart after config change
docker restart kirocrew

# Get new dashboard token
docker exec kirocrew kirocrew token --ttl 2h

# Check Telegram status
docker logs kirocrew | grep -i telegram

# Edit config
vim ~/kirocrew-data/.kiro/crew/config.json
```

### Git workflow

- **Upstream (read-only):** `origin` → `ssh://git@github.com/kirodotdev/KiroCrew.git`
- **Personal fork:** `fork` → `git@github.com-ml:mvn-bachhuynh-dn/KiroCrew.git`
  - Uses SSH host alias `github.com-ml` (key: `~/.ssh/id_rsa`)
  - The default `github.com` SSH key (`id_rsa_smd`) does NOT have access to this repo
- **Branch strategy:** feature branches off `main`, push to `fork`, create PR on fork

```bash
# Create feature branch
git checkout -b feat/my-feature

# Push to personal fork
git push -u fork feat/my-feature
```

### Full setup guide

See `README-STEVEH.md` in the repo root for the complete step-by-step setup
from scratch.

## Security rules for this repo

**This fork is PUBLIC.** Never commit or push:

- API tokens, bot tokens, passwords, or secrets of any kind
- Real email addresses, Telegram user IDs, or Cloudflare account IDs
- Internal domain names (e.g. `*.asiantech.vn`)
- SSH key paths or content
- Any value from `~/.kiro/crew/.env`, `config.json` credentials, or env vars

Use `YOUR_*` placeholders in docs and steering files. Real values belong ONLY in:
- `~/kirocrew-data/.kiro/crew/.env` (on host, never committed)
- `~/kirocrew-data/.kiro/crew/config.json` (on host, never committed)
- Local environment variables

Before pushing, always verify: `git diff <base>..HEAD | grep -iE "(token|secret|@gmail|@.*\.com|asiantech|\d{7,})"` returns nothing sensitive.
