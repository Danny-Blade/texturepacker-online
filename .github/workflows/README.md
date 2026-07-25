# GitHub Actions workflows

One-page index of the workflows in this directory. See
[`docs/ci-docker.md`](../../docs/ci-docker.md) for the full details on
triggers, caching, permissions, and how to reproduce each pipeline locally.

| Workflow | File | Trigger | Purpose |
| --- | --- | --- | --- |
| CI | [`ci.yml`](ci.yml) | PRs and pushes to `main` | Install, lint, type-check, run Vitest, and produce a Next.js production build on the Node 20 and Node 22 matrix. Uploads `.next` as an artifact from the Node-22 leg. |
| Docker | [`docker.yml`](docker.yml) | Tags matching `v*.*.*` and manual `workflow_dispatch` | Build the multi-stage `Dockerfile` and push the image to `ghcr.io/<owner>/<repo>` with tags derived from the git ref. |

## Conventions

- Action versions are pinned to a major (`@v4`, `@v5`, `@v6`) — never
  `@main` or a floating branch.
- Every workflow declares a top-level `permissions:` block with the
  minimum scope it needs.
- Every job sets `timeout-minutes: 15` to fail hung runs fast.
- Every workflow uses a `concurrency` group keyed on
  `${{ github.workflow }}-${{ github.ref }}` so superseded runs are
  cancelled.
- No secrets other than the built-in `GITHUB_TOKEN` are required.
