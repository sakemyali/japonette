from __future__ import annotations

import pytest

from ft_cli import config


def test_friends_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "FRIENDS_FILE", tmp_path / "friends.json")
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)

    friends = config.load_friends()
    assert friends.friends == []

    friends.add(config.Friend(login="norminette", display_name="Norm", added="2026-05-21"))
    config.save_friends(friends)

    again = config.load_friends()
    assert again.has("norminette")
    assert again.friends[0].display_name == "Norm"

    assert again.remove("norminette") is True
    assert not again.has("norminette")


def test_config_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(config, "CONFIG_FILE", tmp_path / "config.toml")

    cfg = config.Config(uid="abc", secret="xyz", default_campus_slug="paris")
    config.save_config(cfg)

    again = config.load_config()
    assert again.uid == "abc"
    assert again.secret == "xyz"
    assert again.default_campus_slug == "paris"
    assert again.configured


@pytest.mark.skipif(
    not (config.load_config().configured),
    reason="no creds in ~/.config/42-cli/; skipping live API smoke",
)
def test_live_campus_endpoint():
    from ft_cli.client import Client

    with Client() as c:
        rows = list(c.paginate("/v2/campus", page_size=5))
    assert len(rows) > 0
    assert "name" in rows[0]
