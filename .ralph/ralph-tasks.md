# Ralph Tasks — Portainer CE API Docs

## Project context

This is a Next.js + Fumadocs docs site that generates MDX API reference docs from OpenAPI 3.1.0 specs.
See `.github/prompts/next-step.prompt.md` for the full project summary.

Key files:

- `scripts/generate-docs.ts` — generates `content/docs/<version>/` MDX from OAS specs
- `content/oas/portainer-ce/3.1.0.yml` — the OAS 3.1.0 spec (API product version is 2.33.7)
- `src/components/api-page.tsx` — server component rendering a single API endpoint page
- `src/lib/openapi.ts` — shared OpenAPI helpers
- `content/docs/v2.33.7/` — currently-generated docs (manually renamed from v3.1.0)

---

## Task list

- [x] **Fix version folder naming in generate-docs.ts** — `discoverSpecs()` currently uses the filename stem (`3.1.0.yml` → `v3.1.0`) instead of `info.version` from the parsed spec (`2.33.7` → `v2.33.7`). Change it to read `info.version` from the parsed YAML. After the fix, re-run `pnpm tsx scripts/generate-docs.ts` and verify the output lands in `content/docs/v2.33.7/`. Also update the Key Files table in `.github/prompts/next-step.prompt.md` to reflect the correct OAS filename (`3.1.0.yml` stays, but the generated folder is now correctly `v2.33.7/`).

- [/] **Generate schema component pages in entity subfolders** — `entities/<tag>/` currently only has `overview.mdx`. Update `generate-docs.ts` to also emit one MDX page per `components/schemas` entry, associated to a tag. Use `x-tags` on the schema if present; otherwise match by name prefix (e.g. `PortainerEndpoint*` → `endpoints` tag). Each schema page should render the schema name, description (if any), and a JSON snippet of the schema object. Update the corresponding `meta.json` to include the new pages.

- [ ] **Make the server URL configurable by the user** — the API playground UI currently has the server URL hardcoded. Investigate where the URL comes from (likely `src/components/api-page.tsx` or `src/lib/openapi.ts`) and add a user-editable "Server URL" field that persists in `localStorage` so developers can point the playground at their own Portainer instance. The default value should come from the spec's `servers[0].url`.

- [ ] **Fix the 19 pre-existing lint errors in 3.1.0.yml** — errors are:
    - 1× `no-identical-paths` — `/endpoints/{id}/kubernetes/helm/{name}` and `/{release}` are identical after parameter substitution; deduplicate or rename the path parameter in the spec
    - 3× `path-parameters-defined` — param name mismatch between the path template and the operation's `parameters` list; align them
    - 15× `security-defined` — operations that reference an undefined security scheme; add `security: []` (public) or `security: [{jwt: []}]` as appropriate
      Run `npx @redocly/cli lint content/oas/portainer-ce/3.1.0.yml` to verify zero errors when done.
