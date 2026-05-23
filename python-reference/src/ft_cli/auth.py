from __future__ import annotations

import time

import httpx

from ft_cli import config

TOKEN_URL = "https://api.intra.42.fr/oauth/token"
SAFETY_MARGIN_SECONDS = 60


class AuthError(RuntimeError):
    pass


def _fetch_token(uid: str, secret: str) -> dict:
    resp = httpx.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": uid,
            "client_secret": secret,
            "scope": "public",
        },
        timeout=15.0,
    )
    if resp.status_code != 200:
        raise AuthError(
            f"Token request failed ({resp.status_code}): {resp.text.strip()}"
        )
    body = resp.json()
    return {
        "access_token": body["access_token"],
        "token_type": body.get("token_type", "bearer"),
        "expires_at": int(time.time()) + int(body.get("expires_in", 0)),
    }


def get_token(force_refresh: bool = False) -> str:
    cfg = config.load_config()
    if not cfg.configured:
        raise AuthError(
            "No credentials configured. Run `42 login` and paste your "
            "API app UID and SECRET from https://profile.intra.42.fr/oauth/applications"
        )

    cached = config.load_token()
    if (
        not force_refresh
        and cached
        and cached.get("expires_at", 0) - time.time() > SAFETY_MARGIN_SECONDS
    ):
        return cached["access_token"]

    fresh = _fetch_token(cfg.uid, cfg.secret)
    config.save_token(fresh)
    return fresh["access_token"]
