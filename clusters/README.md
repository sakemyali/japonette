# Cluster maps

ASCII layouts of 42 campus clusters, rendered by `japonette cluster`. Each
campus has its own directory with one JSON file per physical cluster.

```
clusters/
├── tokyo/
│   ├── c1.json
│   ├── c2.json
│   └── ...
├── paris/
│   ├── c1.json
│   └── ...
└── <your-campus>/
    └── <your-cluster>.json    ← add yours
```

## Why contribute

`japonette cluster --user alice` should show *where alice is sitting* —
useful when you walk into a busy cluster and need to find a friend
quickly. Without a map for your campus, all the CLI can say is "alice is
at `c2r1s4`", which is just a string. With a map, it's "alice is at the
seat circled X, second column from the door."

The CLI ships with whatever maps people contribute. Adding yours = one
PR.

## File naming

Pick a name that reflects the cluster identifier on your campus. Tokyo's
host pattern is `c1r1s8` (`c<N>r<N>s<N>`), so files are `c1.json`,
`c2.json` … through `c6.json` for the 6 physical clusters. Other
campuses can use whatever is intuitive (`paris/c1.json`,
`paris/cluster-3.json`, `kl/main.json`).

The CLI auto-routes `--user alice` to the right file by scanning every
cluster file at her campus until it finds one whose `hosts` array
contains her workstation host string.

## JSON schema

```jsonc
{
  // Human-friendly name shown above the map.
  "name": "Cluster 1 — north floor",

  // Must match the slug of the campus (lowercase, hyphens for spaces).
  // Find yours with `japonette campus list`.
  "campus_slug": "tokyo",

  // Optional: your 42 login or name, so reviewers can credit you.
  "contributed_by": "mosakura",

  // Optional: any notes shown under the header. Where the door is,
  // landmarks, anything a visitor would find useful.
  "notes": "Door is the elevator entrance, top-left.",

  // The map itself, one line per array entry.
  //
  // Draw the room however you want using box-drawing characters,
  // dashes, arrows, labels — anything plain ASCII. Then put `[·]`
  // (left bracket, middle dot, right bracket — exactly 3 chars)
  // wherever a workstation sits.
  //
  // The renderer ONLY touches `[·]` tokens. Everything else passes
  // through untouched.
  "ascii": [
    "    door ──────────────────              ",
    "         ▼                                ",
    "                                          ",
    "      01 [·]            01 [·]           ",
    "            [·] 02            [·] 02     ",
    "      03 [·]            03 [·]           ",
    "            [·] 04            [·] 04     ",
    "      05 [·]            05 [·]           ",
    "            [·] 06            [·] 06     ",
    "      07 [·]            07 [·]           ",
    "            [·] 08            [·] 08     "
  ],

  // Workstation host strings, in the SAME reading order as the `[·]`
  // tokens appear in `ascii` (top-to-bottom, left-to-right within each
  // line). Get these by running `japonette active --campus <slug>` and
  // copying the `host` column.
  //
  // Length MUST equal the number of `[·]` tokens in `ascii`. The CLI
  // errors loudly if the counts don't match.
  "hosts": [
    "c1r1s1", "c1r1s2",
    "c1r1s3", "c1r1s4",
    "c1r1s5", "c1r1s6",
    "c1r1s7", "c1r1s8",
    "c1r2s1", "c1r2s2",
    "c1r2s3", "c1r2s4",
    "c1r2s5", "c1r2s6",
    "c1r2s7", "c1r2s8"
  ]
}
```

> The example above uses JSONC (JSON with comments) for readability.
> Real cluster files must be plain JSON — no comments.

## Render legend

After the renderer substitutes each `[·]` based on live occupancy:

| In the file | After render | Meaning                       |
| ----------- | ------------ | ----------------------------- |
| `[·]`       | `[·]` (dim)  | empty seat                    |
| `[·]`       | `[■]` (cyan) | someone is at this workstation |
| `[·]`       | `[X]` (red)  | the `--user` target sits here  |

The map width never changes — every replacement is also 3 characters.

## Test your file locally before opening a PR

```bash
git clone https://github.com/sakemyali/japonette
cd japonette
npm install

# Add your file at clusters/<your-campus>/<your-cluster>.json,
# then run from the repo root:
npm run build
JAPONETTE_CLUSTERS_DIR=$(pwd)/clusters node dist/cli.js cluster --campus <your-campus> --name <your-cluster>

# Test the X-marks-the-spot rendering:
JAPONETTE_CLUSTERS_DIR=$(pwd)/clusters node dist/cli.js cluster --campus <your-campus> --user <a-friend-currently-online>
```

If `clusters/<your-campus>/` doesn't exist yet, create it.

You can also drop your file at
`~/.config/42-cli/clusters/<your-campus>/<your-cluster>.json` to test
with the installed CLI — that path takes precedence over the bundled
version, so you don't need a local checkout.

## PR checklist

- [ ] `name` is a short human label
- [ ] `campus_slug` matches `japonette campus list`
- [ ] Every `[·]` in `ascii` has a corresponding entry in `hosts`
- [ ] `hosts` are in reading order (top-to-bottom, left-to-right)
- [ ] You've tested locally with `JAPONETTE_CLUSTERS_DIR`
- [ ] Optional but nice: `contributed_by` and `notes` filled in
