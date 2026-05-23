from __future__ import annotations

import typer

from ft_cli import auth, config
from ft_cli.client import ApiError, Client
from ft_cli.render import campus_table, console, err_console

app = typer.Typer(help="Browse and configure campuses.")


def _slug(name: str) -> str:
    return (name or "").lower().replace(" ", "-")


def fetch_all_campuses(client: Client) -> list[dict]:
    return list(client.paginate("/v2/campus", page_size=100))


def load_or_fetch_campuses(client: Client) -> list[dict]:
    cached = config.load_campuses()
    if cached:
        return cached
    fresh = fetch_all_campuses(client)
    config.save_campuses(fresh)
    return fresh


def resolve_campus_id(client: Client, slug: str) -> int | None:
    for c in load_or_fetch_campuses(client):
        if _slug(c.get("name", "")) == slug.lower():
            return int(c["id"])
    return None


@app.command("list")
def list_cmd(
    refresh: bool = typer.Option(False, "--refresh", help="Bypass the local cache.")
) -> None:
    """List all campuses (cached locally for fast reuse)."""
    try:
        with Client() as c:
            if refresh:
                rows = fetch_all_campuses(c)
                config.save_campuses(rows)
            else:
                rows = load_or_fetch_campuses(c)
    except (auth.AuthError, ApiError) as e:
        err_console.print(str(e))
        raise typer.Exit(code=1)

    rows = sorted(rows, key=lambda r: r.get("name") or "")
    campus_table(rows)


@app.command("set")
def set_cmd(slug: str = typer.Argument(..., help="campus slug, e.g. paris")) -> None:
    """Set the default campus used by commands that take --campus."""
    try:
        with Client() as c:
            campus_id = resolve_campus_id(c, slug)
    except (auth.AuthError, ApiError) as e:
        err_console.print(str(e))
        raise typer.Exit(code=1)

    if campus_id is None:
        err_console.print(f"unknown campus slug: {slug}. Try `42 campus list`.")
        raise typer.Exit(code=1)

    cfg = config.load_config()
    cfg.default_campus_slug = slug.lower()
    config.save_config(cfg)
    console.print(f":white_check_mark: default campus set to [cyan]{slug.lower()}[/cyan]")
