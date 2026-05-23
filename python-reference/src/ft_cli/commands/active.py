from __future__ import annotations

import typer

from ft_cli import auth, config
from ft_cli.client import ApiError, Client
from ft_cli.commands.campus import resolve_campus_id
from ft_cli.render import active_table, err_console


def fetch_active_locations(client: Client, campus_id: int, limit: int) -> list[dict]:
    locations: list[dict] = []
    for loc in client.paginate(
        f"/v2/campus/{campus_id}/locations",
        page_size=100,
        **{"filter[active]": "true", "sort": "-begin_at"},
    ):
        locations.append(loc)
        if len(locations) >= limit:
            break
    return locations


def resolve_campus(client: Client, slug: str | None) -> tuple[str, int]:
    cfg = config.load_config()
    chosen = (slug or cfg.default_campus_slug or "").strip().lower()
    if not chosen:
        raise typer.BadParameter(
            "no campus provided and no default set. Try `42 campus set <slug>`."
        )
    campus_id = resolve_campus_id(client, chosen)
    if campus_id is None:
        raise typer.BadParameter(
            f"unknown campus slug: {chosen}. Try `42 campus list`."
        )
    return chosen, campus_id


def active(
    campus: str | None = typer.Option(
        None, "--campus", "-c", help="campus slug (defaults to your saved campus)"
    ),
    limit: int = typer.Option(50, "-n", "--limit", help="max rows to show"),
) -> None:
    """Show users currently logged in at the campus."""
    try:
        with Client() as c:
            slug, campus_id = resolve_campus(c, campus)
            locations = fetch_active_locations(c, campus_id, limit)
    except (auth.AuthError, ApiError) as e:
        err_console.print(str(e))
        raise typer.Exit(code=1)

    active_table(locations, title=f"Active now @ {slug}")
