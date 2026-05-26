# Reference

Deep-dive material that doesn't belong in the README. Read on if you're
curious about how `japonette` works under the hood, hit something
unusual, or are forking the project.

## What happens during `japonette login`

You **do not need** a 42 API app of your own. The CLI uses a hosted OAuth
broker so you can just log in with your 42 account. Step by step:

1. `japonette login` prints a URL and tries to open your default browser.
2. You log in on `intra.42.fr` as you normally would.
3. 42 redirects to the broker, which exchanges the authorization code for
   a token bound to **your** account.
4. The browser hands the token back to a temporary localhost listener.
5. The terminal prints `✓ logged in as <your-login>`.

If your browser didn't open automatically (SSH session, headless, etc.),
copy the printed URL into any browser — same flow, same result.

Verify with:

```bash
japonette whoami
```

It shows your token's scope and lifetime plus a profile card with your
cursus + piscine levels.

## OAuth broker architecture

```
your laptop  ──▶  browser  ──▶  intra.42.fr  ──▶  Cloudflare Worker  ──▶  intra
   (CLI)            (login)        (issue code)        (exchange code        (issue token)
                                                        with SECRET)
   ◀────────────────────────────────────── tokens to localhost ────────────────────────
```

- `client_secret` lives only in a Cloudflare Worker (the broker). It is
  never bundled into the npm package.
- `client_id` is public (it's in your browser's URL during login anyway).
- Access tokens expire in ~2h and are refreshed transparently by hitting
  the broker's `/refresh` with your stored refresh token. The broker is
  stateless — it does the exchange and forgets.

Self-hosting the broker is documented in
[CONTRIBUTING.md](../CONTRIBUTING.md#if-youre-forking-to-run-your-own-broker).

## Rate limits

42 enforces **2 req/sec, 1200/hour per app**. All `japonette` users share
that bucket since the broker app is the same — but normal use is
nowhere near it (a typical `japonette active` is one request). The CLI
paces local requests at 0.5s and retries once on `429`. If you hit a 429
in normal use, please [open an issue](https://github.com/sakemyali/japonette/issues).
