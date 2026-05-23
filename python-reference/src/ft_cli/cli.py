from __future__ import annotations

import typer

from ft_cli import __version__
from ft_cli.commands import active, campus, friends, login, user

app = typer.Typer(
    help="A small CLI for the 42 API. See `42 <command> --help`.",
    no_args_is_help=True,
    add_completion=True,
)

app.command("login")(login.login)
app.command("whoami")(login.whoami)
app.command("user", help="Look up a 42 user.")(user.user)
app.add_typer(campus.app, name="campus")
app.command("active", help="Who's currently logged in at the campus.")(active.active)
app.add_typer(friends.app, name="friends")


@app.command()
def version() -> None:
    """Print the CLI version."""
    typer.echo(__version__)


if __name__ == "__main__":
    app()
