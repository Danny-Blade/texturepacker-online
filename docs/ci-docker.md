# CI and Docker

This document describes the automated build pipelines that ship with Web
TexturePacker, how to reproduce them locally, and the caching strategy each
one relies on.

## CI (`.github/workflows/ci.yml`)

### Triggers

- Every pull request against any branch.
- Every push to `main`.

Superseded runs are cancelled through a `concurrency` group keyed on the
workflow name and git ref, so a new push cancels the older run on the same
branch or PR to save minutes.

### Matrix

The `build` job runs in parallel on `ubuntu-latest` with:

| Node version | Reason                              |
| ------------ | ----------------------------------- |
| `20`         | Active LTS — the floor for the app. |
| `22`         | Current release — early warning for regressions in the next LTS. |

`fail-fast: false` keeps both legs running so a Node-22-only regression does
not hide a Node-20 failure (or vice-versa).

### Steps

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `cache: 'npm'` (keyed on `package-lock.json`).
3. `npm ci`
4. `npm run lint`
5. `npx tsc --noEmit`
6. `npm test -- --reporter=default --run` (Vitest, one-shot mode)
7. `npm run build`

Only the Node-22 job uploads `.next` as a build artifact (retention 7 days),
so we don't duplicate storage across matrix legs.

### Reproduce locally

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
```

### Permissions

`contents: read` is enough — CI does not write to the repo, publish packages,
or create releases.

## Docker (`.github/workflows/docker.yml`)

### Triggers

- Push tags matching `v*.*.*` (e.g. `v1.2.3`, `v2.0.0-beta.1`).
- Manual `workflow_dispatch` from the Actions tab.

### What it does

Builds the multi-stage `Dockerfile` and pushes the resulting image to the
GitHub Container Registry at `ghcr.io/<owner>/<repo>`.

Tags come from `docker/metadata-action@v5`:

| Git ref                | Image tags produced                                |
| ---------------------- | -------------------------------------------------- |
| Tag `v1.2.3`           | `1.2.3`, `1.2`, `1`                                |
| Branch `main`          | `main`, `latest`                                   |
| Other branch `feat/x`  | `feat-x`                                           |

Cross-run cache reuse is provided by `cache-from: type=gha` /
`cache-to: type=gha,mode=max`, backed by the GitHub Actions cache service.

### Permissions

`contents: read` (checkout) plus `packages: write` (push to GHCR). Auth uses
the built-in `secrets.GITHUB_TOKEN` — no external secret needs to be
configured.

## Dockerfile

The image is a three-stage build on `node:22-alpine`:

1. **`deps`** — installs from `package-lock.json` with `npm ci
   --omit=optional`. This layer is only rebuilt when the lockfile changes.
2. **`builder`** — copies the source and runs `next build`. Relies on
   `output: 'standalone'` in `next.config.ts` so the runner stage can drop
   `node_modules` entirely.
3. **`runner`** — copies the standalone server, static assets, `public/`,
   and the Node CLI (`bin/`). Runs as the non-root `node` user, exposes
   `3000`, and starts with `node server.js`.

### Build and run locally

```bash
docker build -t wtp:local .
docker run --rm -p 3000:3000 wtp:local
# then open http://localhost:3000
```

Expect an image size of roughly **200–300 MB** on `node:22-alpine`, dominated
by the Node runtime plus the standalone Next.js bundle.

### Running the Node CLI in Docker

The same image ships the CLI at `bin/wtp.mjs`, so you can pack a directory
without booting the web UI:

```bash
docker run --rm \
  -v "$(pwd)/sprites:/sprites" \
  wtp:local \
  node ./bin/wtp.mjs pack /sprites --out /sprites/out
```

Anything the CLI writes to `/sprites/out` inside the container lands in
`./sprites/out` on the host.

## Caching strategy

### CI cache

- `actions/setup-node@v4` handles the npm cache automatically. The cache
  key is derived from `package-lock.json`, so a lockfile change invalidates
  it and any other change reuses it.
- Vitest is fast enough on this repo (a few seconds) that a per-run cache
  would cost more setup than it saves — no separate cache is configured.
- The `.next` build artifact is uploaded from the Node-22 job only, so we
  keep exactly one copy per successful run.

### Docker cache

- **Layer cache in the Dockerfile.** The `deps` stage only depends on
  `package.json` and `package-lock.json`, so unchanged dependencies keep the
  `node_modules` layer warm across builds. The `builder` stage inherits from
  `deps`, so it picks up the same cached install.
- **GitHub Actions cross-run cache.** `docker/build-push-action@v6` uses
  `type=gha` for both `cache-from` and `cache-to` (`mode=max`), which stores
  every intermediate layer in the Actions cache and reuses them on
  subsequent runs.
- **`.dockerignore`.** Trims the build context (`node_modules`, `.next`,
  `.git`, docs, tests, editor configs) so the daemon does not upload
  hundreds of megabytes on every build.

## Parallelization

- The CI matrix fans out Node 20 and Node 22 across two runners at the
  same time.
- `concurrency` groups on both workflows cancel superseded runs. On PRs
  that means only the latest commit's CI keeps running; on tags each tag
  gets its own group so releases never cancel each other.
- Inside a job, steps are sequential because each depends on the previous
  (install → lint → typecheck → test → build). Splitting into separate
  jobs would double the install cost without saving wall time.

## Environment

- No custom secrets are required. CI needs nothing beyond the default
  `GITHUB_TOKEN`; the Docker workflow uses `GITHUB_TOKEN` for GHCR auth.
- `permissions:` is declared at the top of each workflow with the minimum
  scope needed (`contents: read` for CI; `contents: read` +
  `packages: write` for Docker). This is defence-in-depth: even if a
  workflow file is edited to run untrusted code, its token cannot escalate
  beyond those scopes.
- Each job sets `timeout-minutes: 15` so a hung install or build fails
  fast instead of burning the six-hour default.
