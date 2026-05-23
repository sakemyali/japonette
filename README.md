# japonette

A small CLI for the 42 API.

## Status

Early days. The first cut is a Python prototype in
[`python-reference/`](python-reference/) — typer + httpx, `client_credentials`
auth, table-based output. Run it with:

```bash
cd python-reference
pipx install -e .
ft --help
```

A TypeScript rewrite (intended for `npm install -g`) will land next.

## License

[MIT](LICENSE).
