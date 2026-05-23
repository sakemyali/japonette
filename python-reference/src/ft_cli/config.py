from __future__ import annotations

import json
import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import tomli_w

CONFIG_DIR = Path.home() / ".config" / "42-cli"
CONFIG_FILE = CONFIG_DIR / "config.toml"
TOKEN_FILE = CONFIG_DIR / "token.json"
CAMPUSES_FILE = CONFIG_DIR / "campuses.json"
FRIENDS_FILE = CONFIG_DIR / "friends.json"


def ensure_dir() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(CONFIG_DIR, 0o700)


def _write_secure(path: Path, data: str) -> None:
    ensure_dir()
    path.write_text(data)
    os.chmod(path, 0o600)


@dataclass
class Config:
    uid: str = ""
    secret: str = ""
    default_campus_slug: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.uid and self.secret)


def load_config() -> Config:
    if not CONFIG_FILE.exists():
        return Config()
    with CONFIG_FILE.open("rb") as f:
        data = tomllib.load(f)
    return Config(
        uid=data.get("uid", ""),
        secret=data.get("secret", ""),
        default_campus_slug=data.get("default_campus_slug", ""),
    )


def save_config(cfg: Config) -> None:
    payload = {
        "uid": cfg.uid,
        "secret": cfg.secret,
        "default_campus_slug": cfg.default_campus_slug,
    }
    _write_secure(CONFIG_FILE, tomli_w.dumps(payload))


def load_token() -> dict[str, Any] | None:
    if not TOKEN_FILE.exists():
        return None
    try:
        return json.loads(TOKEN_FILE.read_text())
    except json.JSONDecodeError:
        return None


def save_token(token: dict[str, Any]) -> None:
    _write_secure(TOKEN_FILE, json.dumps(token, indent=2))


def load_campuses() -> list[dict[str, Any]] | None:
    if not CAMPUSES_FILE.exists():
        return None
    try:
        data = json.loads(CAMPUSES_FILE.read_text())
    except json.JSONDecodeError:
        return None
    return data.get("campuses")


def save_campuses(campuses: list[dict[str, Any]]) -> None:
    ensure_dir()
    CAMPUSES_FILE.write_text(json.dumps({"campuses": campuses}, indent=2))


@dataclass
class Friend:
    login: str
    display_name: str = ""
    added: str = ""


@dataclass
class FriendsList:
    friends: list[Friend] = field(default_factory=list)

    def has(self, login: str) -> bool:
        return any(f.login == login for f in self.friends)

    def add(self, friend: Friend) -> None:
        if not self.has(friend.login):
            self.friends.append(friend)

    def remove(self, login: str) -> bool:
        before = len(self.friends)
        self.friends = [f for f in self.friends if f.login != login]
        return len(self.friends) != before


def load_friends() -> FriendsList:
    if not FRIENDS_FILE.exists():
        return FriendsList()
    try:
        data = json.loads(FRIENDS_FILE.read_text())
    except json.JSONDecodeError:
        return FriendsList()
    return FriendsList(
        friends=[
            Friend(
                login=f["login"],
                display_name=f.get("display_name", ""),
                added=f.get("added", ""),
            )
            for f in data.get("friends", [])
        ]
    )


def save_friends(friends: FriendsList) -> None:
    ensure_dir()
    payload = {
        "friends": [
            {"login": f.login, "display_name": f.display_name, "added": f.added}
            for f in friends.friends
        ]
    }
    FRIENDS_FILE.write_text(json.dumps(payload, indent=2))
