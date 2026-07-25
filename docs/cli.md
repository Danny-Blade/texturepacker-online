# Web TexturePacker CLI (`wtp`)

`wtp` is the Node CLI wrapper around the shared packer core (Phase 3 tasks
P3-01 + P3-02). It runs entirely on your machine — no server, no browser —
and produces the same atlases and data files the web app exports.

## Install

The CLI ships alongside the web app in this repository. From the repo root:

```bash
npm install
npm run cli:build            # transpile the shared core to dist/cli/
node ./bin/wtp.mjs --help    # or, after `npm link`, just `wtp --help`
```

`npm link` is optional — every command below works with
`node ./bin/wtp.mjs …` too.

## Quick example

Pack every image under `./sprites` into a Phaser 3 atlas with a power-of-two
sheet size:

```bash
wtp pack ./sprites --out ./dist --format phaser3 --pot
```

Outputs land in `./dist/`:

- `spritesheet.png` — the atlas image
- `spritesheet.json` — the Phaser 3 data file

## Commands

```
wtp pack <input-dir> [options]
wtp project <file.wtp.json | file.tps> [--override key=value ...]
wtp version
wtp help
```

### `wtp pack`

Recursively loads every PNG/JPG/GIF/WebP file under `<input-dir>` and writes
the packed atlas + data file(s) to `--out`.

| Option              | Default          | Notes                                                                 |
| ------------------- | ---------------- | --------------------------------------------------------------------- |
| `--out <dir>`       | `./output`       | Output directory; created if missing.                                 |
| `--name <basename>` | `spritesheet`    | Base name applied to every emitted file.                              |
| `--format <fmt>`    | `json`           | Any registered export format (see `wtp help` for the list).           |
| `--image-format`    | `png`            | `png` \| `png-8` \| `jpg` \| `webp`.                                  |
| `--max-width`       | `2048`           | Maximum atlas width in pixels.                                        |
| `--max-height`      | `2048`           | Maximum atlas height in pixels.                                       |
| `--padding <n>`     | `2`              | Sets both border padding and shape padding.                           |
| `--extrude <n>`     | `0`              | Extrude halo width in pixels.                                         |
| `--rotate`          | off              | Allow 90° sprite rotation.                                            |
| `--pot`             | off              | Force power-of-two output dimensions.                                 |
| `--trim <mode>`     | `none`           | `none` \| `trim` \| `crop-keep-position` \| `crop-flush` \| `polygon-outline`. |
| `--multipack`       | off              | Spill unfittable sprites into extra sheets instead of failing.        |
| `--algorithm <alg>` | `maxrects-bssf`  | Any packing algorithm listed in the help.                             |
| `--scale <n>`       | `1`              | Emit a scale variant; repeat for multiples (e.g. `--scale 1 --scale 2`). |
| `--json`            | off              | Emit a machine-readable JSON summary on stdout instead of pretty text.|
| `-v`, `--verbose`   | off              | Progress messages on stderr.                                          |
| `--force`           | off              | Bypass the Smart Update short-circuit (once wired to the CLI).        |

### `wtp project`

Loads a `.wtp.json` project or a compatible `.tps` file. The CLI validates the
extension today but delegates loading to the shared project reader once
P3-02's follow-up ships. Overrides are collected as `--override key=value` for
that stage.

### `wtp version`

Prints the package version on stdout — useful for smoke tests.

## Exit codes

| Code | Meaning                                          |
| ---- | ------------------------------------------------ |
| `0`  | Success                                          |
| `1`  | Runtime / IO / packing error                     |
| `2`  | Invalid argument or option                       |

## Machine-readable output

`--json` replaces the pretty stdout with a single JSON object suitable for
piping to `jq` or a CI job. Shape:

```json
{
  "ok": true,
  "inputDir": "/abs/path/to/sprites",
  "outputDir": "/abs/path/to/output",
  "format": "phaser3",
  "imageFormat": "png",
  "sprites": 42,
  "sheets": [{ "path": "…/spritesheet.png", "width": 512, "height": 512, "spriteCount": 42, "scale": 1 }],
  "dataFiles": [{ "path": "…/spritesheet.json", "format": "phaser3" }],
  "failed": []
}
```

## How it hooks into the shared core

`bin/wtp.mjs` is a thin ESM entry that imports the browser-agnostic core
(compiled to `dist/cli/`) and injects a `CanvasFactory` backed by
[`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas). Every image
transformation, packing decision and format string that runs in the browser
also runs in the CLI — the two paths differ only in where their canvases
come from.
