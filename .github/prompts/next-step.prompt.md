# Portainer CE API Docs — Session Summary

## Project Overview

A **Next.js + Fumadocs** documentation site for the [Portainer CE API](https://portainer.io). Generates MDX-based API reference docs from OpenAPI 3.1.0 specs.

## Key Files & Scripts

| File                                           | Purpose                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `scripts/convert-to-oas31.ts`                  | End-to-end Swagger 2.0 → OAS 3.1.0 converter (`pnpm convert-oas`)            |
| `scripts/convert-to-oas31.md`                  | Documentation for the converter                                              |
| `scripts/generate-docs.ts`                     | Generates `content/docs/v2.33.7/` MDX tree from OAS specs                    |
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

- Discovers all `.yml` files in `content/oas/portainer-ce/` and maps them to version folders using the **filename stem** (`3.1.0.yml` → `v3.1.0/`). This is a known mismatch — the current spec's product version is `2.33.7` but the file is named for its OAS format version. The `v2.33.7/` docs folder was manually renamed as a workaround; the pipeline still needs a proper fix (see Next steps).
- Pre-loads `SpecMeta` (tag names, descriptions, `x-tagGroups` order, `info.description`) via `loadSpecMeta()`.
- Uses `x-tagGroups` order for sidebar navigation (not alphabetical).
- For each tag, generates an `entities/<tag>/overview.mdx` page (from the tag's `description`) and a stub `meta.json` listing only `overview`. **No schema component pages are generated** — the entities subfolders are effectively empty beyond the overview.
- Version `index.mdx` uses `info.description` from the spec.

## Known issue — version folder naming

`generate-docs.ts` derives the version folder name from the **filename stem** (`3.1.0.yml` → `v3.1.0`), not `info.version` (`2.33.7`). The `content/docs/v2.33.7/` folder was created by manually renaming the originally generated `v3.1.0/` folder, but the pipeline is not yet fixed — re-running `generate-docs.ts` would regenerate `content/docs/v3.1.0/` again. The fix must be one of:

- Rename `3.1.0.yml` → `2.33.7.yml` (filename reflects the API product version, not the OAS format version), or
- Change `discoverSpecs()` to read `info.version` from the parsed spec instead of the filename.

## Next steps

1. **Resolve the version folder naming issue** — either rename `3.1.0.yml` → `2.33.7.yml` or change `discoverSpecs()` to read `info.version` from the parsed spec; without this every `generate-docs` run would regenerate `v3.1.0/` and overwrite the manually renamed `v2.33.7/` folder.
2. **Generate schema component pages inside entity subfolders** — `entities/<tag>/` currently only contains `overview.mdx`. `generate-docs.ts` needs to parse `components/schemas` from the spec, associate each schema with its tag (via `x-tags` or naming convention), and emit an MDX page per schema so the subfolder is actually useful.
3. **Make the server URL configurable by the user** — the API playground UI has the server URL hardcoded (visible in the screenshot); it must be settable per-user so developers can point it at their own Portainer instance.
4. **Fix the 19 pre-existing lint errors** in `3.1.0.yml` — path param mismatches (3×) and operations missing a `security` field (15×), plus the 1× `no-identical-paths`.
5. **Check fumadocs-openapi `x-tagGroups` support** — the extension is in the spec; verify whether `fumadocs-openapi` renders it natively or if `generate-docs.ts` already handles everything needed.
6. **Add future Portainer CE releases** — place a new Swagger 2.0 file in `content/oas/portainer-ce/` and run `pnpm convert-oas` — the `convert.config.json` is picked up automatically.
