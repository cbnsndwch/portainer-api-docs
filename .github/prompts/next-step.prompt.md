# Portainer CE API Docs — Session Summary

## Project Overview

A **Next.js + Fumadocs** documentation site for the [Portainer CE API](https://portainer.io). Generates MDX-based API reference docs from OpenAPI 3.1.0 specs.

## Key Files & Scripts

| File                                           | Purpose                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `scripts/convert-to-oas31.ts`                  | End-to-end Swagger 2.0 → OAS 3.1.0 converter (`pnpm convert-oas`)            |
| `scripts/convert-to-oas31.md`                  | Documentation for the converter                                              |
| `scripts/generate-docs.ts`                     | Generates `content/docs/<version>/` MDX tree from OAS specs                  |
| `content/oas/portainer-ce/3.1.0.yml`           | Canonical OAS 3.1.0 spec (converted & cleaned from Swagger 2.0)              |
| `content/oas/portainer-ce/convert.config.json` | Sidecar converter config — tag descriptions, x-tagGroups, server description |
| `src/components/api-page.tsx`                  | Server component rendering a single API endpoint page                        |
| `src/lib/openapi.ts`                           | Shared OpenAPI helpers                                                       |
| `src/lib/source.ts`                            | Fumadocs source configuration                                                |

`content/docs/` and `content/oas/` are both tracked in git (not gitignored).

## Common Commands

```sh
pnpm dev          # start dev server
pnpm build        # production build
pnpm lint         # eslint
pnpm format       # prettier
pnpm convert-oas <swagger.yml> [out.yml] [--config cfg.json]
                  # convert Swagger 2.0 → OAS 3.1.0
pnpm tsx scripts/generate-docs.ts
                  # regenerate content/docs/ from OAS specs
```

## Converter pipeline (`convert-to-oas31.ts`)

4 steps run in sequence:

1. **Text substitutions** — built-in (`environment(endpoint)` → `endpoint`, etc.) + custom `textReplacements` from config.
2. **swagger2openapi** (programmatic, `patch: true`, `warnOnly: true`) → OAS 3.0.0.
3. **3.0 → 3.1 schema transforms** — `nullable` → type array, `exclusiveMinimum`/`Maximum` bool → numeric, strips `x-s2o-*`.
4. **Post-conversion cleanup** — `jwt` apiKey-in-Authorization → HTTP Bearer; applies `serverDescription`, `tagDescriptions`, `x-tagGroups` from sidecar config.

**Sidecar config** auto-loaded from `<input-basename>.config.json` or `convert.config.json` next to the input.

## OAS 3.1.0 spec state (`content/oas/portainer-ce/3.1.0.yml`)

- Converted from the original Portainer CE `2.33.7` Swagger 2.0 spec (original deleted).
- **19 pre-existing lint errors** (from `@redocly/cli lint`) — not regressions, all in the upstream source:
    - 1 × `no-identical-paths` (`/endpoints/{id}/kubernetes/helm/{name}` vs `/{release}`)
    - 3 × `path-parameters-defined` — param name mismatch between path template and operation
    - 15 × `security-defined` — operations without a security scheme
- **44 warnings** — missing `operationId` on some websocket/kubernetes routes.
- Security scheme fixed: `jwt` is now `type: http / scheme: bearer / bearerFormat: JWT`.
- `x-tagGroups` defines 11 navigation groups: Authentication, Users & Teams, Environments, Edge Computing, Kubernetes, Docker & Stacks, Templates, Intel AMT, System & Settings, GitOps, WebSocket.

## `generate-docs.ts` — what it does with the spec

- Discovers all `.yml` files in `content/oas/portainer-ce/` and maps them to version folders (`3.1.0.yml` → `v3.1.0/`).
- Pre-loads `SpecMeta` (tag names, descriptions, `x-tagGroups` order, `info.description`) via `loadSpecMeta()`.
- Uses `x-tagGroups` order for sidebar navigation (not alphabetical).
- Entity overview pages use the tag's `description` from the spec.
- Version `index.mdx` uses `info.description` from the spec.

## Known issue — version folder naming

`generate-docs.ts` derives the version folder name from the **filename** (`3.1.0.yml` → `v3.1.0`), not `info.version` (`2.33.7`). The generated docs therefore live under `content/docs/v3.1.0/` instead of `content/docs/v2.33.7/`. Decide whether to:

- Rename `3.1.0.yml` → `2.33.7.yml` (now that it's OAS 3.1, the filename can reflect the API product version), or
- Change `discoverSpecs()` to read `info.version` instead of the filename.

## Next steps

1. **Fix the 19 pre-existing lint errors** in `3.1.0.yml` — path param mismatches and missing `security` fields.
2. **Resolve the version folder naming issue** (see above).
3. **Check fumadocs-openapi `x-tagGroups` support** — the extension is in the spec; verify whether `fumadocs-openapi` renders it natively or if `generate-docs.ts` already handles everything needed.
4. **Add future Portainer CE releases** — place a new Swagger 2.0 file in `content/oas/portainer-ce/` and run `pnpm convert-oas` — the `convert.config.json` is picked up automatically.
