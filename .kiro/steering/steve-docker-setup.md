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

Rules learned from running PRs on this fork and upstream:

- **One commit per PR.** Upstream's PR Hygiene allows 1-2 commits and no merge
  commits. To refresh a stale branch, rebase (`git fetch origin && git rebase
  origin/main`, or "Update with rebase" on GitHub), never "Update branch" /
  merge. Squash before pushing, then `git push --force-with-lease`.
- **PR description follows `.github/PULL_REQUEST_TEMPLATE.md` verbatim**,
  headings included (`## Why it matters`, `## Not a goal`, …); PR Hygiene fails
  on a missing heading.
- **Delete a branch after its PR merges**, and check `gh pr view <n> --json
  state` before pushing to a PR branch: a commit pushed after the merge never
  reaches `main`.
- **Keep fork `main` in sync with upstream** through a `sync/upstream-main` PR
  (merge commit, not squash). A stale fork `main` fails gates that upstream has
  already fixed (expired dependency-audit exceptions, missing CI workflows).
- **Fork CI cannot pass every lane.** The AI review lanes, Design/First
  Principles and `internal-content-scan` need upstream secrets; Dependency
  License Gate needs the fork's dependency graph. Red there is not a code
  defect. On upstream, a fork PR's workflows wait for a maintainer's "Approve
  and run" after every push.
- **The Slack Channels Onboard app lives in its own repo**
  (`mvn-bachhuynh-dn/slack-channels-onboard`): its `AGENTS.md` owns the
  `main`/`release` flow. `contrib/apps/channel-onboard` here is an older copy.

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
