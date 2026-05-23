from __future__ import annotations

import typer

from ft_cli import auth
from ft_cli.client import ApiError, Client
from ft_cli.render import err_console, user_card


def user(login: str = typer.Argument(..., help="42 login")) -> None:
    """Show a profile card for the given login."""
    try:
        with Client() as c:
            data = c.get_json(f"/v2/users/{login}")
    except ApiError as e:
        if e.status == 404:
            err_console.print(f"user not found: {login}")
            raise typer.Exit(code=1)
        err_console.print(str(e))
        raise typer.Exit(code=1)
    except auth.AuthError as e:
        err_console.print(str(e))
        raise typer.Exit(code=1)

    user_card(data)
