from __future__ import annotations

import typer

from ft_cli import auth, config
from ft_cli.client import ApiError, Client
from ft_cli.render import console, err_console


def login() -> None:
    """Prompt for your 42 API app UID and SECRET, then save them locally."""
    console.print(
        "Get UID/SECRET from [link]https://profile.intra.42.fr/oauth/applications[/link]"
    )
    cfg = config.load_config()
    uid = typer.prompt("UID", default=cfg.uid or None, show_default=bool(cfg.uid))
    secret = typer.prompt(
        "SECRET",
        default=cfg.secret or None,
        show_default=False,
        hide_input=True,
    )
    cfg.uid = uid.strip()
    cfg.secret = secret.strip()
    config.save_config(cfg)

    try:
        auth.get_token(force_refresh=True)
    except auth.AuthError as e:
        err_console.print(f"Credentials saved, but token request failed: {e}")
        raise typer.Exit(code=1)

    console.print(":white_check_mark: credentials saved and token verified")


def whoami() -> None:
    """Verify the cached token by hitting /v2/oauth/token/info."""
    try:
        with Client() as c:
            info = c.get_json("/v2/oauth/token/info")
    except (auth.AuthError, ApiError) as e:
        err_console.print(str(e))
        raise typer.Exit(code=1)

    scopes = info.get("scopes") or []
    console.print(f"app_id:        {info.get('application', {}).get('id', '-')}")
    console.print(f"app_name:      {info.get('application', {}).get('name', '-')}")
    console.print(f"scopes:        {', '.join(scopes) if scopes else '-'}")
    console.print(f"expires_in:    {info.get('expires_in_seconds', '-')}s")
