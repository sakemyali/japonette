from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import httpx

from ft_cli import auth

BASE_URL = "https://api.intra.42.fr"
MIN_SPACING_SECONDS = 0.5


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"API error {status}: {body[:200]}")
        self.status = status
        self.body = body


class Client:
    def __init__(self) -> None:
        self._http = httpx.Client(base_url=BASE_URL, timeout=20.0)
        self._last_request_at: float = 0.0

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *_exc: object) -> None:
        self._http.close()

    def _pace(self) -> None:
        delta = time.monotonic() - self._last_request_at
        if delta < MIN_SPACING_SECONDS:
            time.sleep(MIN_SPACING_SECONDS - delta)

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {auth.get_token()}"}

    def get(self, path: str, **params: Any) -> httpx.Response:
        for attempt in range(2):
            self._pace()
            resp = self._http.get(path, params=params, headers=self._headers())
            self._last_request_at = time.monotonic()
            if resp.status_code == 429 and attempt == 0:
                retry_after = float(resp.headers.get("Retry-After", "1"))
                time.sleep(retry_after)
                continue
            if resp.status_code == 401 and attempt == 0:
                # Token might have just expired; force refresh once.
                auth.get_token(force_refresh=True)
                continue
            return resp
        return resp

    def get_json(self, path: str, **params: Any) -> Any:
        resp = self.get(path, **params)
        if resp.status_code >= 400:
            raise ApiError(resp.status_code, resp.text)
        return resp.json()

    def paginate(self, path: str, page_size: int = 100, **params: Any) -> Iterator[Any]:
        page = 1
        while True:
            chunk = self.get_json(
                path, **params, **{"page[number]": page, "page[size]": page_size}
            )
            if not isinstance(chunk, list):
                # Some endpoints return a dict; yield once and stop.
                yield chunk
                return
            for item in chunk:
                yield item
            if len(chunk) < page_size:
                return
            page += 1
