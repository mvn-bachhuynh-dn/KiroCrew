# Channel Onboard

A Kiro Crew app that gives every Slack channel its own agent bundle: an agent
(`kiro_agent: kirocrew`), a workspace directory, a private member memory, and the
`slack.channels.<id>` binding that routes the channel to it.

This is slices 2 and 3 of channel auto-onboarding. Slice 1 is the CLI script
`scripts/onboard-slack-channel.py` in the Kiro Crew repo.

## What it does

- **Detects** channels the bot is a member of that have no binding yet (polls
  `users.conversations` every `poll_secs`, default 300 s).
- **Onboards** them according to `mode`:
  - `auto` — create the bundle immediately, then DM the owner what was created;
  - `notify` — DM the owner once that the channel is waiting;
  - `off` — no background work; the page still works.
- **Guard:** with `require_owner_member` (default on) it only acts on channels the
  owner is also in, so someone who can merely invite the bot cannot make the
  gateway create agents.
- **Dashboard page** (sidebar → *Channel Onboard*): one-click Onboard for waiting
  channels; edit workspace directory (must already exist — e.g. an existing repo),
  activation and `thread_follow` for onboarded ones; edit the detector settings.

- **Unbind a channel the bot has left**: a configured channel whose bot membership
  is gone shows a *Gỡ* button that removes only its `slack.channels` binding (and
  its roles entry). Refused while the bot is still in the channel or when Slack
  cannot be read; the agent, workspace and memory are kept. SEL `channel_onboard.unbind`.
- **People** (slice 4): manage who may use the bot.
  - *Members* -> `slack.allowed_users` in config.json. Members may talk to the
    bot but are read-only; this relies on local gateway patches (Sets K/M2/O2/O3).
    Changes are hot-applied to the running gateway; no restart.
  - *Maintainers per channel* -> `<data home>/channel-roles.json`
    (`{"channels": {"C…": {"maintainers": ["U…"]}}}`, written atomically, mode 600).
    A maintainer gets scoped write inside that channel's workspace and read-only
    git (local gateway patch Set P). They must be a member first, and removing a
    member also removes them as a maintainer everywhere. User IDs are checked
    against Slack (`users:read`), so bots and deactivated accounts are refused.
  - *Approved commands per channel* -> the same file,
    `channels.<C>.commands` (`typecheck`, `lint`, `build`, `deploy`, `git-write`,
    `gh-pr`, `wrangler-tail`). A maintainer shell command made only of approved
    commands runs without an approval prompt (local gateway patch Set P2, which
    also write-locks build/tooling config such as `package.json`, lockfiles,
    `wrangler.*`, `vite.config.*`, `tsconfig*`). Package installs and remote
    database commands are never approvable. Unknown ids are rejected here and
    ignored by the gateway.
  - *Approved programs per channel* -> `channels.<C>.programs`. When a
    maintainer needs something not allowed yet, the gateway (local patch Set R)
    asks the owner in the Slack thread: *Cho phép 1 lần* / *Luôn cho phép* /
    *Từ chối*. "Luôn cho phép" stores the rule (a command id above, or a program
    name) here, where it is listed and removable. Shells, interpreters,
    network tools and package managers can never be stored.
  - *Open channel* -> the same file, `channels.<C>.open = true` (local gateway
    patch Set Q). Every human member of that channel may talk to the bot THERE
    with member (read-only) rights, without being in `slack.allowed_users`.
    The gateway refuses bots, deactivated accounts, guests and Slack Connect
    users from another workspace, and scopes every non-owner read to the
    channel's workspace.
  - Every change is written to the SEL audit log (`channel_onboard.members_update` /
    `maintainers_update` / `commands_update` / `open_update` / `programs_update`).

- **Agent backend** (slice 5): a column in the channel table pins the harness
  (kiro, kas, claude, ...) the channel's agent runs on, as
  `agents.<name>.acp_backend` (upstream kirodotdev/KiroCrew#21910; local gateway
  patch Set U). *Gateway default* removes the pin, *kiro* stores `""`. Only a
  backend the gateway allows and that is installed can be picked; the pin lives
  on the agent, so channels sharing it switch together, and only new threads
  are affected. Shown only when the gateway reads the field. SEL
  `channel_onboard.backend_update`.

## How it writes

The backend runs as in-gateway hooks (`backend.hooks`), not a separate process,
and reuses the gateway's own paths:

- config edits: `config.loader.update_config_locked` + `slack.handler._reload_orch_cfg`
  (the same steps the owner's Slack channel modal takes; `slack.channels` is
  live-applied, no restart);
- a new agent with private memory: the `POST /api/agents` sequence
  (`provision_member_memory` + `persist_member_config`, with rollback of an
  unpublished allocation);
- the binding is written last, so a failure never leaves a channel bound to a
  half-created agent.

All routes are owner-only (`require_owner_dashboard_request`). The Slack bot token
is read from the gateway credential store at call time and never logged or
returned.

## Caveats

- In-gateway Python runs with full gateway privileges (the gateway logs a
  `SECURITY: executing third-party app` warning). Only install it if you trust it.
- It imports Kiro Crew internals, so a Kiro Crew update can break it. After an
  update, check the gateway log for `channel-onboard` errors.
- Deleting an onboarded agent from the dashboard leaves its private member memory
  store on disk (gateway behaviour); there is no store purge API.
- Developed against Kiro Crew 0.8.0.

## Build, install, test

```bash
cd ui && npm install && npm run build && rm -rf node_modules && cd ..
kirocrew app install "$PWD"
kirocrew app enable channel-onboard
python -m pytest tests -q          # backend unit tests (no gateway needed)
```
