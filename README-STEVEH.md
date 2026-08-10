# Steve's Kiro Crew Docker Setup Guide

Personal setup notes for deploying Kiro Crew in Docker with Telegram channel
(behind networks that block `api.telegram.org` via DPI).

## Prerequisites

- Docker installed
- Cloudflare account (for Telegram proxy Worker)
- `wrangler` CLI (for deploying Worker)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram user ID (get from [@userinfobot](https://t.me/userinfobot))

## Architecture

```
Browser ──► Docker (kirocrew:5476) ──► Telegram via Cloudflare Worker proxy
                                         (bypasses DPI blocking)

┌─────────────────────────────────────────────────────────┐
│  Docker container: ghcr.io/kirodotdev/kirocrew:stable   │
│                                                         │
│  Volumes:                                               │
│    ~/kirocrew-data → /home/kirocrew (state/config)      │
│    ~/kirocrew-patches → patched .py files (ro)          │
│                                                         │
│  Env:                                                   │
│    TELEGRAM_API_BASE_URL → Worker proxy URL             │
│    KIROCREW_ALLOW_UNSANDBOXED=1                         │
└─────────────────────────────────────────────────────────┘
```

## Step 1: Deploy Cloudflare Worker (Telegram Proxy)

The Worker proxies all requests to `api.telegram.org`, bypassing DPI.

### 1.1 Create Worker files

```bash
mkdir -p /tmp/telegram-proxy

cat > /tmp/telegram-proxy/index.js << 'EOF'
export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "api.telegram.org";
    url.protocol = "https:";
    const newRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
    });
    return fetch(newRequest);
  }
};
EOF

cat > /tmp/telegram-proxy/wrangler.toml << 'EOF'
name = "telegram-proxy"
main = "index.js"
compatibility_date = "2024-01-01"
EOF
```

### 1.2 Deploy with wrangler

```bash
cd /tmp/telegram-proxy
# Use OAuth login (the CLOUDFLARE_API_TOKEN_GMAIL doesn't have workers_scripts write)
CLOUDFLARE_API_TOKEN="" CLOUDFLARE_ACCOUNT_ID="3b90d7e872640e27405defd7bb9a6813" wrangler deploy
```

Result: `https://telegram-proxy.bach-huynhvan.workers.dev`

### 1.3 Test Worker

```bash
curl -sS "https://telegram-proxy.bach-huynhvan.workers.dev/bot123:fake/getMe"
# Expected: {"ok":false,"error_code":401,"description":"Unauthorized"}
# (401 = Telegram received it, proxy works)
```

## Step 2: Prepare Patched Files

Kiro Crew doesn't natively support `TELEGRAM_API_BASE_URL`. We patch 2 files
and mount them into the container.

### 2.1 Patch `telegram/client.py`

In `src/kiro_crew/telegram/client.py`, replace:

```python
# Bot API base URL.
_API_BASE = "https://api.telegram.org/bot{token}/{method}"
```

With:

```python
# Bot API base URL. Override with TELEGRAM_API_BASE_URL for proxy setups
# (e.g. a Cloudflare Worker reverse proxy when api.telegram.org is blocked).
_API_BASE = os.environ.get(
    "TELEGRAM_API_BASE_URL",
    "https://api.telegram.org/bot{token}/{method}",
)
```

### 2.2 Patch `dashboard/handlers/messaging.py`

In the `_validate_telegram_token()` function, replace:

```python
    timeout = aiohttp.ClientTimeout(total=_TOKEN_VERIFY_TIMEOUT)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(f"https://api.telegram.org/bot{token}/getMe") as resp:
```

With:

```python
    timeout = aiohttp.ClientTimeout(total=_TOKEN_VERIFY_TIMEOUT)
    _tg_base = os.environ.get(
        "TELEGRAM_API_BASE_URL",
        "https://api.telegram.org/bot{token}/{method}",
    )
    verify_url = _tg_base.format(token=token, method="getMe")
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(verify_url) as resp:
```

### 2.3 Copy patched files to host

```bash
mkdir -p ~/kirocrew-patches/telegram ~/kirocrew-patches/dashboard/handlers

cp src/kiro_crew/telegram/client.py ~/kirocrew-patches/telegram/client.py
cp src/kiro_crew/dashboard/handlers/messaging.py ~/kirocrew-patches/dashboard/handlers/messaging.py
```

## Step 3: Prepare Host Directory

```bash
mkdir -p ~/kirocrew-data
```

## Step 4: Run Docker Container

```bash
docker run -d --name kirocrew \
  -e KIROCREW_ALLOW_UNSANDBOXED=1 \
  -e "TELEGRAM_API_BASE_URL=https://telegram-proxy.bach-huynhvan.workers.dev/bot{token}/{method}" \
  -p 5476:5476 \
  -v ~/kirocrew-data:/home/kirocrew \
  -v ~/kirocrew-patches/telegram/client.py:/usr/local/lib/python3.12/site-packages/kiro_crew/telegram/client.py:ro \
  -v ~/kirocrew-patches/dashboard/handlers/messaging.py:/usr/local/lib/python3.12/site-packages/kiro_crew/dashboard/handlers/messaging.py:ro \
  ghcr.io/kirodotdev/kirocrew:stable
```

## Step 5: First-Run Configuration

### 5.1 Login kiro-cli (agent runtime)

```bash
docker exec -it kirocrew kiro-cli login
```

Follow the auth flow in terminal.

### 5.2 Get dashboard token

```bash
docker exec kirocrew kirocrew token --ttl 2h
```

Open the printed link immediately (tokens expire fast).

### 5.3 Configure dashboard.url (for remote/domain access)

Edit config to allow access from your domain:

```bash
vim ~/kirocrew-data/.kiro/crew/config.json
```

Set `dashboard.url` to match **exactly** the URL you use in the browser:

```json
{
  "dashboard": {
    "url": "https://kirocrew.asiantech.vn"
  }
}
```

Without this, you get: `CSRF check failed: request origin not allowed`

Restart after changing:

```bash
docker restart kirocrew
```

### 5.4 Configure Telegram

Edit `~/kirocrew-data/.kiro/crew/config.json`:

```json
{
  "telegram": {
    "enabled": true,
    "allowed_user_ids": [7961476537],
    "soft_threshold_pct": 80,
    "allow_forum": false,
    "allowed_forum_chat_ids": []
  }
}
```

Set bot token in `.env`:

```bash
echo 'TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE' > ~/kirocrew-data/.kiro/crew/.env
chmod 600 ~/kirocrew-data/.kiro/crew/.env
```

Restart:

```bash
docker restart kirocrew
```

## Quick Verification

```bash
# Container healthy?
docker ps --filter name=kirocrew --format "{{.Status}}"

# API responding?
docker exec kirocrew curl -sS http://127.0.0.1:5476/api/health

# Telegram connected?
TOKEN=$(docker exec kirocrew kirocrew token --ttl 1h 2>&1 | grep -oP 'token=\K[^&"]+' | head -1)
docker exec kirocrew curl -sS -b "mc_token_5476=$TOKEN" http://127.0.0.1:5476/api/telegram/config | python3 -m json.tool
# Look for: "connected": true
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `CSRF check failed: request origin not allowed` | `dashboard.url` doesn't match browser URL | Set `dashboard.url` in config.json to exact browser URL (protocol + host + port) |
| `Telegram unreachable at startup (TimeoutError)` | `api.telegram.org` blocked by DPI | Use Cloudflare Worker proxy (this guide) |
| `Telegram settings are managed on the machine... read-only` | Accessing dashboard remotely | Normal in Docker — use `docker exec` or edit files on host via bind mount |
| Dashboard 403 after domain change | Stale token or missing CORS | Re-mint token: `docker exec kirocrew kirocrew token --ttl 2h` |
| Container unhealthy | Gateway crash | Check `docker logs kirocrew` |

## Key Facts

- **Config path (host):** `~/kirocrew-data/.kiro/crew/config.json`
- **Secrets (host):** `~/kirocrew-data/.kiro/crew/.env`
- **Worker URL:** `https://telegram-proxy.bach-huynhvan.workers.dev`
- **Dashboard domain:** `https://kirocrew.asiantech.vn`
- **Telegram user ID:** `7961476537`
- **Cloudflare account:** `Bach.huynhvan@gmail.com` (ID: `3b90d7e872640e27405defd7bb9a6813`)
- **Workers subdomain:** `bach-huynhvan`
- **All Telegram config is boot-read** — any change requires `docker restart kirocrew`
- **Channel credential pages are always read-only from dashboard web** — use bind mount or `docker exec`
- Patched files target: `/usr/local/lib/python3.12/site-packages/kiro_crew/`
