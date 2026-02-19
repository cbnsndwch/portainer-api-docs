# [CBN] Portainer API Docs Platform (Community Project)

Readable, searchable, and agent-friendly API docs for Portainer.

This project exists because I use Portainer in a homelab as a staging environment for my app's dev inner loop. I needed a clean API reference that works well for both humans and coding agents when pushing/test-driving changes. The official API docs are hard to navigate in that workflow, so this repo is a community-first attempt to make the developer experience better.

While I've added one Portainer CE version (v2.33.7, which is the latest LTS, and the one I'm using), the architecture is already set up for multiple CE versions and can support Business Edition (BE) docs with the same pipeline.

> Unofficial and community-maintained. Not affiliated with the Portainer team.

## Why this project matters

- **Better inner loop:** Faster test/deploy iterations against Portainer from local dev and agents.
- **Better docs UX:** Versioned, structured, and searchable API pages.
- **Better collaboration:** Open source, transparent generation pipeline, easy to contribute fixes.
- **Future-ready scope:** Supports multi-version docs and can cover both CE and BE.

If you build with Portainer, your feedback is welcome — issues and PRs are the whole point.

## What you'll find here

- OpenAPI source files in `content/oas/portainer-ce/*.yml`
- Generated docs in `content/docs/v*/` (do not edit by hand)
- Converter pipeline in `scripts/convert-to-oas31.ts`
- Docs generator in `scripts/generate-docs.ts`
- Next.js + Fumadocs site source in `src/`

## Current status and roadmap

- **Current:** CE docs are published from generated OpenAPI sources.
- **Ready now:** Multiple API versions on one site.
- **Next logical step:** Add a BE OpenAPI source folder and generate BE docs in parallel.
- **Long-term:** Single official docs domain with CE/BE + version switcher.

## Why this can replace Swagger-hosted docs

- **Version governance in Git:** Every docs change is diff-able, reviewable, and attributable.
- **Automatable publishing:** Regenerate docs directly from source OAS as part of release workflows.
- **Better IA for real usage:** Endpoint grouping, entity overviews, and consistent navigation.
- **Agent-friendly by default:** Content structure works better for code assistants and API automation.
- **Unified docs product:** Same site can host CE and BE without maintaining separate docs experiences.

If Portainer wants an official migration path, this repository can serve as a practical starting point: import authoritative OAS specs, define release automation, and publish from one maintained pipeline.

## Quick start

Requirements:

- Node.js 24+
- `pnpm`

Install and run:

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:3000>.

## Update or add API versions

1. Add a Swagger/OpenAPI file under `content/oas/portainer-ce/`
2. Convert Swagger 2.0 to OAS 3.1.0 (if needed):

    ```bash
    pnpm convert-oas content/oas/portainer-ce/<file>.yml
    ```

3. Rename output to the Portainer version (example: `2.34.0.yml`)
4. Regenerate docs:

    ```bash
    pnpm tsx scripts/generate-docs.ts
    ```

5. Validate locally with `pnpm dev`

## Contributing

Contributions are very welcome — especially from folks using Portainer in real dev/staging workflows.

Good contribution areas:

- API spec corrections
- Missing/unclear endpoint descriptions
- Better tag grouping and navigation
- Generation pipeline reliability improvements
- Agent/readability improvements for endpoint docs

Before opening a PR:

```bash
pnpm lint
pnpm types
pnpm tsx scripts/generate-docs.ts
```

## Project goals

- Keep docs up to date with Portainer CE and BE releases
- Make endpoint discovery fast for humans and AI agents
- Lower friction for automation-oriented Portainer users
- Build this in the open with community input

## Tech stack

- Next.js 16
- Fumadocs (UI + MDX)
- TypeScript
- Tailwind CSS

---

If you're from the Portainer team: thank you for building a great platform. This repo is intended as a constructive community contribution and a credible candidate for an official API docs home.

## License

MIT © [Cbnsndwch](https://github.com/cbnsndwch)
