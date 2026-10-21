"""Tests for scripts/onboard-slack-channel.py (channel auto-onboarding, slice 1).

The script provisions a per-channel agent bundle in config.json and can
reconfigure an onboarded channel. These tests drive the pure dict functions and
the CLI against a temporary KIROCREW_HOME, so they never touch a real config.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

_SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "onboard-slack-channel.py"


def _load():
    spec = importlib.util.spec_from_file_location("onboard_slack_channel", _SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["onboard_slack_channel"] = module
    spec.loader.exec_module(module)
    return module


onboard = _load()

CHANNEL = "C0TEST00001"


def _provision(cfg: dict, **overrides) -> list[str]:
    kwargs = dict(
        channel_id=CHANNEL,
        name="demo",
        workspace_dir="/tmp/demo-ws",
        activation="mention",
        thread_follow=True,
        memory_store="default",
        description="demo agent",
        force=False,
    )
    kwargs.update(overrides)
    return onboard.provision_channel(cfg, **kwargs)


def test_provision_creates_full_bundle():
    cfg: dict = {}
    changes = _provision(cfg)

    assert changes
    assert cfg["workspaces"]["demo"] == {"dir": "/tmp/demo-ws"}
    assert cfg["agents"]["demo"]["kiro_agent"] == "kirocrew"
    assert cfg["agents"]["demo"]["memory_store"] == "default"
    assert cfg["slack"]["channels"][CHANNEL] == {
        "activation": "mention",
        "agent": "demo",
        "thread_follow": True,
    }


def test_provision_is_idempotent():
    cfg: dict = {}
    _provision(cfg)
    assert _provision(cfg) == []


def test_provision_refuses_dedicated_store_in_slice_one():
    with pytest.raises(ValueError):
        _provision({}, memory_store="demo")


def test_reconfigure_changes_only_passed_fields():
    cfg: dict = {}
    _provision(cfg)

    changes = onboard.reconfigure_channel(cfg, channel_id=CHANNEL, workspace_dir="/srv/repo")

    assert len(changes) == 1
    assert cfg["workspaces"]["demo"]["dir"] == "/srv/repo"
    assert cfg["slack"]["channels"][CHANNEL]["activation"] == "mention"
    assert cfg["slack"]["channels"][CHANNEL]["thread_follow"] is True


def test_reconfigure_activation_and_thread_follow():
    cfg: dict = {}
    _provision(cfg)

    changes = onboard.reconfigure_channel(
        cfg, channel_id=CHANNEL, activation="always", thread_follow=False
    )

    assert len(changes) == 2
    assert cfg["slack"]["channels"][CHANNEL] == {
        "activation": "always",
        "agent": "demo",
        "thread_follow": False,
    }


def test_reconfigure_no_change_is_noop():
    cfg: dict = {}
    _provision(cfg)
    assert onboard.reconfigure_channel(cfg, channel_id=CHANNEL, activation="mention") == []


def test_reconfigure_unknown_channel_raises():
    with pytest.raises(LookupError):
        onboard.reconfigure_channel({}, channel_id=CHANNEL, activation="always")


def test_reconfigure_binding_without_agent_raises():
    cfg = {"slack": {"channels": {CHANNEL: {"activation": "mention"}}}}
    with pytest.raises(LookupError):
        onboard.reconfigure_channel(cfg, channel_id=CHANNEL, activation="always")


@pytest.fixture
def crew_home(tmp_path, monkeypatch):
    home = tmp_path / "crew"
    home.mkdir()
    (home / "config.json").write_text(json.dumps({}))
    monkeypatch.setenv("KIROCREW_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    return home


def _run(monkeypatch, *argv: str) -> int:
    monkeypatch.setattr(sys, "argv", ["onboard-slack-channel.py", *argv])
    return onboard.main()


def test_cli_create_then_reconfigure(crew_home, tmp_path, monkeypatch):
    assert _run(monkeypatch, "--channel", CHANNEL, "--name", "demo") == 0
    cfg = json.loads((crew_home / "config.json").read_text())
    assert cfg["slack"]["channels"][CHANNEL]["thread_follow"] is True
    assert (tmp_path / "Projects" / "demo").is_dir()

    repo = tmp_path / "existing-repo"
    repo.mkdir()
    rc = _run(
        monkeypatch,
        "--channel",
        CHANNEL,
        "--reconfigure",
        "--workspace",
        str(repo),
        "--no-thread-follow",
    )
    assert rc == 0
    cfg = json.loads((crew_home / "config.json").read_text())
    assert cfg["workspaces"]["demo"]["dir"] == str(repo.resolve())
    assert cfg["slack"]["channels"][CHANNEL]["thread_follow"] is False
    assert (crew_home / "config.json.bak-onboard").exists()


def test_cli_reconfigure_rejects_missing_workspace(crew_home, tmp_path, monkeypatch):
    assert _run(monkeypatch, "--channel", CHANNEL, "--name", "demo") == 0
    rc = _run(
        monkeypatch, "--channel", CHANNEL, "--reconfigure", "--workspace", str(tmp_path / "nope")
    )
    assert rc == 2


def test_cli_reconfigure_requires_a_field(crew_home, monkeypatch):
    assert _run(monkeypatch, "--channel", CHANNEL, "--name", "demo") == 0
    assert _run(monkeypatch, "--channel", CHANNEL, "--reconfigure") == 2


def test_cli_dry_run_writes_nothing(crew_home, monkeypatch):
    assert _run(monkeypatch, "--channel", CHANNEL, "--name", "demo", "--dry-run") == 0
    assert json.loads((crew_home / "config.json").read_text()) == {}
