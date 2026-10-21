#!/usr/bin/env python3
"""Onboard a Slack channel into Kiro Crew as a self-contained agent (slice 1).

Add the bot to a Slack channel, then run this script with the channel id (or
name) to provision, in one step, a dedicated "bundle" for that channel:

  * an agent entry in ``config.json`` (``agents.<name>``) whose ``kiro_agent``
    inherits the default ``kirocrew`` mode — a per-channel agent with its own
    workspace/memory/triggers, running on the shared kirocrew toolset;
  * a workspace entry (``workspaces.<name>``) pointing at a fresh directory;
  * a named memory store (``memory_stores.<name>``) so the channel's learned
    context is kept separate from every other channel;
  * a channel binding (``slack.channels.<id>``) routing that channel to the
    agent, with a chosen activation mode and ``thread_follow``.

This is the semi-automatic (slice 1) form of channel onboarding. Slices 2 and 3
(auto-trigger on first mention, and a dashboard reconfigure page) build on the
same provisioning the ``provision_channel`` function performs here, so that
function is the single source of truth for "what a channel bundle is".

Design notes:
  * Idempotent. Re-running for an already-onboarded channel changes nothing
    unless ``--force`` is passed to re-point an existing binding.
  * The agent is created with ``kiro_agent = "kirocrew"`` (slice-1 default):
    no user-level mode spec is needed, so the agent is advertised and dispatch
    works immediately. A per-channel mode (its own toolset/prompt) is a slice-2+
    option, out of scope here.
  * Secrets never touch this file. The Slack bot token is read from the Kiro
    Crew ``.env`` at run time to resolve a channel *name* to its id; it is never
    printed and never written anywhere.
  * The script edits ``config.json`` but does NOT restart the gateway — the
    caller decides when to restart (the live config watcher may also pick the
    change up). It prints the exact restart command to run.

Usage:
    python3 scripts/onboard-slack-channel.py --channel C0XXXXXXXXX
    python3 scripts/onboard-slack-channel.py --channel-name my-team-channel
    python3 scripts/onboard-slack-channel.py --channel C0XXXXXXXXX \\
        --name my-team --workspace /path/to/project \\
        --activation mention --no-thread-follow
    # change an already-onboarded channel (only the flags you pass are applied):
    python3 scripts/onboard-slack-channel.py --channel C0XXXXXXXXX --reconfigure \\
        --workspace /path/to/existing/repo --activation always --thread-follow

Exit codes: 0 success (or no-op), 2 bad input / channel not found, 1 write error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

VALID_ACTIVATIONS = ("always", "mention", "observe", "review", "off")

# A channel/agent/store name becomes a single path segment and a config key.
# Mirror the constraint Kiro Crew puts on memory-store names: a single segment,
# no separators, conservative length. Lowercase + dash/underscore keeps it a
# safe directory name and a stable Slack-channel-derived slug.
_SLUG_RE = re.compile(r"[^a-z0-9_-]+")
_MAX_NAME = 48


def kirocrew_home() -> Path:
    """Resolve the Kiro Crew data home, honoring KIROCREW_HOME."""
    env = os.environ.get("KIROCREW_HOME")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".kiro" / "crew"


def slugify(raw: str) -> str:
    """Turn a Slack channel name into a safe agent/workspace/store name."""
    s = raw.strip().lower().lstrip("#")
    s = _SLUG_RE.sub("-", s).strip("-")
    return s[:_MAX_NAME] or "channel"


def read_bot_token(home: Path) -> str | None:
    """Read SLACK_BOT_TOKEN from the Kiro Crew .env, or None if absent.

    Never logged, never written. Used only to resolve a channel name -> id.
    """
    env_path = home / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line.startswith("SLACK_BOT_TOKEN"):
            _, _, val = line.partition("=")
            return val.strip().strip('"').strip("'") or None
    return None


def resolve_channel_name_to_id(token: str, name: str) -> str | None:
    """Resolve a Slack channel *name* to its id via users.conversations.

    Returns the channel id, or None if not found / API error. The token is sent
    only to slack.com over HTTPS and is not surfaced in output.
    """
    want = name.strip().lstrip("#").lower()
    url = (
        "https://slack.com/api/users.conversations"
        "?types=public_channel,private_channel&limit=1000"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected -- the URL is a literal https://slack.com/api/ endpoint; nothing dynamic reaches it  # noqa: E501
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # network / parse — fail soft, caller reports
        print(f"error: Slack API call failed: {exc}", file=sys.stderr)
        return None
    if not data.get("ok"):
        print(f"error: Slack API returned not-ok: {data.get('error')}", file=sys.stderr)
        return None
    for ch in data.get("channels", []):
        if (ch.get("name") or "").lower() == want:
            return ch.get("id")
    return None


def load_config(home: Path) -> tuple[Path, dict]:
    path = home / "config.json"
    if not path.exists():
        print(f"error: config not found at {path}", file=sys.stderr)
        sys.exit(2)
    return path, json.loads(path.read_text())


def provision_channel(
    cfg: dict,
    *,
    channel_id: str,
    name: str,
    workspace_dir: str,
    activation: str,
    thread_follow: bool,
    memory_store: str | None,
    description: str,
    force: bool,
) -> list[str]:
    """Add the agent/workspace/memory-store/channel-binding bundle to *cfg*.

    Returns a list of human-readable change descriptions (empty == no-op).
    Mutates *cfg* in place. This is the shared provisioning used by every
    onboarding slice, so it never performs I/O beyond the dict it is handed.
    """
    changes: list[str] = []

    # 1. workspace entry
    ws = cfg.setdefault("workspaces", {})
    if name not in ws:
        ws[name] = {"dir": workspace_dir}
        changes.append(f"workspaces.{name} -> {workspace_dir}")

    # 2. agent entry — slice-1 default: inherit the kirocrew mode.
    agents = cfg.setdefault("agents", {})
    if name not in agents:
        entry = {
            "kiro_agent": "kirocrew",
            "workspace": name,
            "memory_store": memory_store or "default",
            "model": "",
            "description": description,
            "triggers": name,
            "source": "kirocrew",
            "watchdog_tool_stall_suspect_secs": 0.0,
            "watchdog_tool_stall_hard_cap_secs": 0.0,
            "session_color": "",
            "telegram_account": "",
        }
        agents[name] = entry
        changes.append(f"agents.{name} (kiro_agent=kirocrew, memory_store={entry['memory_store']})")

    # 3. named memory store (slice 2+): a 0.8.0 named store is NOT just a config
    # entry — it needs a real on-disk directory with a versioned database
    # identity (see memory_stores.require_memory_store / ensure_memory_store_dir),
    # and a store declared without that is REFUSED at resolve time rather than
    # recreated empty. Provisioning that correctly (V1 version stamp + dir, or a
    # V2 member) is deferred to a later slice; slice 1 shares the default store so
    # the channel works immediately. ``memory_store`` is therefore always
    # "default" here; the parameter is kept for the slice-2 path to fill in.
    if memory_store and memory_store != "default":
        raise ValueError(
            "dedicated per-channel memory store is a slice-2 feature; "
            "slice 1 uses the default store"
        )

    # 4. channel binding
    channels = cfg.setdefault("slack", {}).setdefault("channels", {})
    existing = channels.get(channel_id)
    binding = {"activation": activation, "agent": name, "thread_follow": thread_follow}
    if existing is None:
        channels[channel_id] = binding
        changes.append(f"slack.channels.{channel_id} -> agent={name}, activation={activation}")
    elif force and existing != binding:
        channels[channel_id] = binding
        changes.append(f"slack.channels.{channel_id} RE-POINTED -> agent={name}")
    return changes


def reconfigure_channel(
    cfg: dict,
    *,
    channel_id: str,
    workspace_dir: str | None = None,
    activation: str | None = None,
    thread_follow: bool | None = None,
) -> list[str]:
    """Change an ALREADY-onboarded channel's bundle in place.

    Only the fields that are not ``None`` are touched. The agent is the one the
    channel binding points at. Raises ``LookupError`` when the channel has no
    binding or its agent/workspace entry is missing, so a reconfigure never
    silently creates a new bundle (that is ``provision_channel``'s job).
    Returns human-readable change descriptions (empty == no-op).
    """
    channels = cfg.get("slack", {}).get("channels", {})
    binding = channels.get(channel_id)
    if binding is None:
        raise LookupError(f"channel {channel_id} is not onboarded (no slack.channels entry)")
    name = binding.get("agent", "")
    agent = cfg.get("agents", {}).get(name) if name else None
    if not agent:
        raise LookupError(f"channel {channel_id} binds to agent {name!r}, which is not in agents")

    changes: list[str] = []
    if workspace_dir is not None:
        ws_key = agent.get("workspace") or name
        ws = cfg.setdefault("workspaces", {}).setdefault(ws_key, {})
        if ws.get("dir") != workspace_dir:
            changes.append(f"workspaces.{ws_key}.dir: {ws.get('dir')} -> {workspace_dir}")
            ws["dir"] = workspace_dir
    if activation is not None and binding.get("activation") != activation:
        changes.append(
            f"slack.channels.{channel_id}.activation: {binding.get('activation')} -> {activation}"
        )
        binding["activation"] = activation
    if thread_follow is not None and binding.get("thread_follow") != thread_follow:
        changes.append(
            f"slack.channels.{channel_id}.thread_follow: "
            f"{binding.get('thread_follow')} -> {thread_follow}"
        )
        binding["thread_follow"] = thread_follow
    return changes


def main() -> int:
    ap = argparse.ArgumentParser(description="Onboard a Slack channel as a Kiro Crew agent bundle.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--channel", help="Slack channel id (C.../G...).")
    g.add_argument(
        "--channel-name", help="Slack channel name; resolved to an id via the bot token."
    )
    ap.add_argument("--name", help="Agent/workspace name (default: slug of channel name/id).")
    ap.add_argument("--workspace", help="Workspace directory (default: ~/Projects/<name>).")
    ap.add_argument(
        "--activation",
        choices=VALID_ACTIVATIONS,
        default=None,
        help="Channel activation mode (default on create: mention).",
    )
    tf = ap.add_mutually_exclusive_group()
    tf.add_argument(
        "--no-thread-follow",
        dest="thread_follow",
        action="store_false",
        help="Require an @mention on every message, even inside an active thread.",
    )
    tf.add_argument(
        "--thread-follow",
        dest="thread_follow",
        action="store_true",
        help="Follow an active thread without re-mentioning (create default).",
    )
    ap.set_defaults(thread_follow=None)
    ap.add_argument(
        "--reconfigure",
        action="store_true",
        help="Change an already-onboarded channel instead of creating one: only "
        "--workspace / --activation / --(no-)thread-follow that you pass are applied. "
        "--workspace must be an existing directory (e.g. an existing repo).",
    )
    ap.add_argument(
        "--no-dedicated-memory",
        action="store_true",
        help="(Reserved) Dedicated per-channel memory is a later slice; slice 1 "
        "always shares the default store. Flag kept for forward compatibility.",
    )
    ap.add_argument("--description", default="", help="Agent description.")
    ap.add_argument("--force", action="store_true", help="Re-point an existing channel binding.")
    ap.add_argument("--dry-run", action="store_true", help="Print changes without writing.")
    args = ap.parse_args()

    home = kirocrew_home()
    channel_id = args.channel
    channel_label = args.channel

    if args.channel_name:
        token = read_bot_token(home)
        if not token:
            print(
                "error: --channel-name needs SLACK_BOT_TOKEN in the Kiro Crew .env", file=sys.stderr
            )
            return 2
        channel_id = resolve_channel_name_to_id(token, args.channel_name)
        if not channel_id:
            print(
                f"error: channel '{args.channel_name}' not found (is the bot a member?)",
                file=sys.stderr,
            )
            return 2
        channel_label = f"{args.channel_name} ({channel_id})"

    if args.reconfigure:
        if args.workspace is None and args.activation is None and args.thread_follow is None:
            print(
                "error: --reconfigure needs at least one of --workspace, --activation, "
                "--thread-follow/--no-thread-follow",
                file=sys.stderr,
            )
            return 2
        new_ws = None
        if args.workspace is not None:
            new_ws = str(Path(args.workspace).expanduser().resolve())
            if not Path(new_ws).is_dir():
                print(f"error: workspace {new_ws} does not exist", file=sys.stderr)
                return 2
        path, cfg = load_config(home)
        try:
            changes = reconfigure_channel(
                cfg,
                channel_id=channel_id,
                workspace_dir=new_ws,
                activation=args.activation,
                thread_follow=args.thread_follow,
            )
        except LookupError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        if not changes:
            print(f"no-op: channel {channel_label} already has that configuration.")
            return 0
        print(f"Reconfiguring Slack channel {channel_label}:")
        for c in changes:
            print(f"  ~ {c}")
        if args.dry_run:
            print("\n(dry-run; nothing written)")
            return 0
        return _write_config(path, cfg)

    name = slugify(args.name or args.channel_name or channel_id)
    workspace_dir = args.workspace or str(Path.home() / "Projects" / name)
    # Slice 1 always shares the default store (see provision_channel note 3).
    memory_store = "default"
    description = args.description or f"{name} project agent (auto-onboarded from Slack channel)"

    path, cfg = load_config(home)
    changes = provision_channel(
        cfg,
        channel_id=channel_id,
        name=name,
        workspace_dir=workspace_dir,
        activation=args.activation or "mention",
        thread_follow=True if args.thread_follow is None else args.thread_follow,
        memory_store=memory_store,
        description=description,
        force=args.force,
    )

    if not changes:
        print(f"no-op: channel {channel_label} already onboarded as agent '{name}'.")
        return 0

    print(f"Onboarding Slack channel {channel_label} as agent '{name}':")
    for c in changes:
        print(f"  + {c}")

    if args.dry_run:
        print("\n(dry-run; nothing written)")
        return 0

    # Create the workspace directory so the first turn has a real cwd.
    try:
        Path(workspace_dir).expanduser().mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        print(f"error: could not create workspace dir {workspace_dir}: {exc}", file=sys.stderr)
        return 1

    return _write_config(path, cfg)


def _write_config(path: Path, cfg: dict) -> int:
    """Back up config.json, then write it atomically (temp + replace)."""
    try:
        backup = path.with_suffix(path.suffix + ".bak-onboard")
        backup.write_text(path.read_text())
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
        os.replace(tmp, path)
    except OSError as exc:
        print(f"error: config write failed: {exc}", file=sys.stderr)
        return 1

    print(f"\nWrote {path} (backup: {backup.name}).")
    print("Restart the gateway to load it:  sudo systemctl restart kirocrew")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
