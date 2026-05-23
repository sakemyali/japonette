from __future__ import annotations

from datetime import date

import typer

from ft_cli import auth, config
from ft_cli.client import ApiError, Client
from ft_cli.commands.active import fetch_active_locations, resolve_campus
from ft_cli.config import Friend, load_friends, save_friends
from ft_cli.render import (
    console,
    err_console,
    friends_online_table,
    friends_table,
)

app = typer.Typer(help="Local friends watchlist (stored on this machine only).")


@app.command()
def add(login: str = typer.Argument(..., help="42 login to add")) -> None:
    """Validate the login against the API, then append it to the local list."""
    login = login.strip().lower()
    friends = load_friends()
    if friends.has(login):
        console.print(f"[dim]{login} is already in your friends list[/dim]")
        return

    try:
        with Client() as c:
            user = c.get_json(f"/v2/users/{login}")
    except ApiError as e:
        if e.status == 404:
            err_console.print(f"login not found on intra: {login}")
            raise typer.Exit(code=1)
        err_console.print(str(e))
        raise typer.Exit(code=1)
    except auth.AuthError as e:
        err_console.print(str(e))
        raise typer.Exit(code=1)

    friends.add(
        Friend(
            login=login,
            display_name=user.get("displayname") or user.get("usual_full_name") or "",
            added=date.today().isoformat(),
        )
    )
    save_friends(friends)
    console.print(f":heavy_plus_sign: added [cyan]{login}[/cyan]")


@app.command()
def remove(login: str = typer.Argument(..., help="42 login to remove")) -> None:
    """Remove a login from your local friends list."""
    login = login.strip().lower()
    friends = load_friends()
    if friends.remove(login):
        save_friends(friends)
        console.print(f":heavy_minus_sign: removed [cyan]{login}[/cyan]")
    else:
        err_console.print(f"{login} is not in your friends list")
        raise typer.Exit(code=1)


@app.command("list")
def list_cmd() -> None:
    """Show all friends in your local list."""
    friends = load_friends()
    friends_table(
        [
            {"login": f.login, "display_name": f.display_name, "added": f.added}
            for f in friends.friends
        ]
    )


@app.command()
def online(
    campus: str | None = typer.Option(
        None, "--campus", "-c", help="campus slug (defaults to your saved campus)"
    ),
) -> None:
    """Show which of your friends are currently active at the campus."""
    friends = load_friends()
    if not friends.friends:
        console.print("[dim]no friends yet — add some with `42 friends add <login>`[/dim]")
        return

    friend_logins = {f.login for f in friends.friends}
    try:
        with Client() as c:
            _slug, campus_id = resolve_campus(c, campus)
            locations = fetch_active_locations(c, campus_id, limit=1000)
    except (auth.AuthError, ApiError) as e:
        err_console.print(str(e))
        raise typer.Exit(code=1)

    matched = [
        loc for loc in locations if (loc.get("user") or {}).get("login") in friend_logins
    ]
    active_logins = {(loc.get("user") or {}).get("login") for loc in matched}
    offline = list(friend_logins - active_logins)
    friends_online_table(matched, offline)
