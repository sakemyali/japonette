from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from rich.console import Console
from rich.table import Table

console = Console()
err_console = Console(stderr=True, style="red")


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _fmt_duration(begin: str | None) -> str:
    dt = _parse_iso(begin)
    if not dt:
        return "-"
    delta = datetime.now(timezone.utc) - dt
    total = int(delta.total_seconds())
    h, rem = divmod(total, 3600)
    m, _ = divmod(rem, 60)
    return f"{h}h{m:02d}m"


def _fmt_time(s: str | None) -> str:
    dt = _parse_iso(s)
    return dt.astimezone().strftime("%Y-%m-%d %H:%M") if dt else "-"


def user_card(u: dict[str, Any]) -> None:
    cursus_users = u.get("cursus_users") or []
    level = "-"
    if cursus_users:
        levels = [cu.get("level", 0) for cu in cursus_users]
        level = f"{max(levels):.2f}"

    primary_campus = "-"
    for c in u.get("campus_users") or []:
        if c.get("is_primary"):
            primary_campus = str(c.get("campus_id", "-"))
            break

    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_column(style="cyan")
    table.add_column()
    table.add_row("login", u.get("login", "-"))
    table.add_row("name", u.get("displayname") or u.get("usual_full_name") or "-")
    table.add_row("email", u.get("email", "-"))
    table.add_row("level", level)
    table.add_row("location", u.get("location") or "offline")
    table.add_row("campus_id", primary_campus)
    table.add_row("pool", f"{u.get('pool_month', '-')} {u.get('pool_year', '-')}")
    console.print(table)


def campus_table(rows: Iterable[dict[str, Any]]) -> None:
    table = Table(title="Campuses")
    table.add_column("id", justify="right")
    table.add_column("name")
    table.add_column("city")
    table.add_column("country")
    table.add_column("slug", style="cyan")
    for r in rows:
        table.add_row(
            str(r.get("id", "")),
            r.get("name", ""),
            r.get("city", "") or "",
            r.get("country", "") or "",
            (r.get("name", "") or "").lower().replace(" ", "-"),
        )
    console.print(table)


def active_table(locations: list[dict[str, Any]], title: str = "Active now") -> None:
    table = Table(title=title)
    table.add_column("login", style="cyan")
    table.add_column("host")
    table.add_column("since")
    table.add_column("duration", justify="right")
    for loc in locations:
        user = loc.get("user") or {}
        table.add_row(
            user.get("login", "-"),
            loc.get("host", "-"),
            _fmt_time(loc.get("begin_at")),
            _fmt_duration(loc.get("begin_at")),
        )
    if not locations:
        console.print("[dim]nobody is active[/dim]")
    else:
        console.print(table)


def friends_table(rows: list[dict[str, Any]]) -> None:
    table = Table(title="Friends")
    table.add_column("login", style="cyan")
    table.add_column("name")
    table.add_column("added")
    for r in rows:
        table.add_row(r.get("login", "-"), r.get("display_name", "-"), r.get("added", "-"))
    if not rows:
        console.print("[dim]no friends yet — add some with `42 friends add <login>`[/dim]")
    else:
        console.print(table)


def friends_online_table(
    active: list[dict[str, Any]], offline_logins: list[str]
) -> None:
    table = Table(title="Friends online")
    table.add_column("login", style="cyan")
    table.add_column("host")
    table.add_column("since")
    table.add_column("duration", justify="right")
    for loc in active:
        user = loc.get("user") or {}
        table.add_row(
            user.get("login", "-"),
            loc.get("host", "-"),
            _fmt_time(loc.get("begin_at")),
            _fmt_duration(loc.get("begin_at")),
        )
    if active:
        console.print(table)
    else:
        console.print("[dim]no friends active[/dim]")

    if offline_logins:
        console.print(f"[dim]offline:[/dim] {', '.join(sorted(offline_logins))}")
