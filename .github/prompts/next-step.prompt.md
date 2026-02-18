# Portainer CE API Docs — Session Summary

## Project Overview

This is a **Next.js + Fumadocs** documentation site for the [Portainer CE API](https://portainer.io). It generates MDX-based API reference docs from OpenAPI 3.1.0 specs.

## Key Files & Scripts

- `scripts/generate-docs.ts` — generates MDX content under `content/docs/<version>/` from an OAS spec
- `scripts/convert-to-oas31.ts` — converts a Swagger 2.0 spec to OAS 3.1.0 YAML (`pnpm convert-oas`)
- `content/oas/portainer-ce/3.1.0.yml` — the canonical OAS 3.1.0 source spec
- `src/components/api-page.tsx` — server component rendering a single API endpoint page
- `src/lib/openapi.ts` — shared OpenAPI helpers
- `src/lib/source.ts` — Fumadocs source configuration

## Versions

- `v2.33.7` — legacy version, fully generated
- `v3.1.0` — current version, fully generated

## Common Commands

```sh
pnpm dev          # start dev server
pnpm build        # production build
pnpm lint         # eslint
pnpm format       # prettier
pnpm convert-oas  # convert Swagger 2.0 → OAS 3.1.0
```

## Next Steps

<!-- Replace this section with the actual next steps after summarizing a session -->
