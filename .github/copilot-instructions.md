# Copilot Repository Instructions

## Project Overview

This repository hosts an **unofficial, community-maintained API documentation site for Portainer** (both Community Edition and Business Edition). The site is built with Next.js and Fumadocs and generates API reference documentation from OpenAPI 3.1.0 specification files.

**Key characteristics:**
- Documentation is **generated from OpenAPI YAML files** (source of truth)
- Supports multiple API versions
- Built for both human readability and AI agent interaction
- Currently focuses on Portainer CE, but architected for multi-version and BE support

## Project Structure

```
.github/
  prompts/          # Agent prompt templates for various tasks
  copilot-instructions.md  # This file

content/
  oas/
    portainer-ce/   # OpenAPI 3.1.0 specification files
      <version>.yml # One file per Portainer version (e.g., 2.33.7.yml)
      convert.config.json  # Configuration for OAS converter
  docs/
    getting-started/  # Hand-written documentation (safe to edit)
    v<version>/       # Generated API reference (DO NOT EDIT MANUALLY)
      endpoints/      # One MDX file per API endpoint
      entities/       # Overview pages per tag group

scripts/
  convert-to-oas31.ts  # Swagger 2.0 → OAS 3.1.0 converter
  generate-docs.ts     # OAS → MDX documentation generator
  ralph/               # Iterative AI agent loop runner

src/
  app/              # Next.js app router pages
  components/       # React components
  lib/              # Utility functions
```

## Technology Stack

- **Framework:** Next.js 16 with App Router
- **UI Library:** Fumadocs UI/MDX 16
- **Styling:** Tailwind CSS 4
- **Language:** TypeScript (strict mode)
- **Package Manager:** pnpm (required)
- **Runtime:** Node.js 24+

## Coding Standards

### TypeScript
- Use strict mode TypeScript
- Prefer type inference where reasonable
- Use interfaces for object shapes
- Avoid `any` types

### Code Style
- Format with Prettier (`.prettierrc.json`)
- Lint with ESLint (`eslint.config.mjs`)
- Use consistent naming: camelCase for variables/functions, PascalCase for components

### Documentation
- Keep MDX files in `content/docs/getting-started/` for hand-written content
- **NEVER** manually edit generated files in `content/docs/v*/` directories
- Update OpenAPI YAML files as the source of truth, then regenerate

## Development Workflow

### Setup
```bash
pnpm install     # Install dependencies
pnpm dev         # Start dev server at http://localhost:3000
```

### Quality Checks
```bash
pnpm lint        # Run ESLint
pnpm types       # Type check (fumadocs-mdx + tsc)
pnpm format      # Format code with Prettier
pnpm build       # Production build
```

### Adding a New API Version

1. **Place the OpenAPI/Swagger file** in `content/oas/portainer-ce/`

2. **Convert Swagger 2.0 to OAS 3.1.0** (if needed):
   ```bash
   pnpm convert-oas content/oas/portainer-ce/<source-file>.yml
   ```
   This uses `convert.config.json` for tag descriptions and grouping.

3. **Rename the output** to match the Portainer version:
   ```bash
   mv content/oas/portainer-ce/3.1.0.yml content/oas/portainer-ce/2.34.0.yml
   ```
   Update the `info.version` field in the YAML to match.

4. **Generate MDX documentation**:
   ```bash
   pnpm tsx scripts/generate-docs.ts
   ```
   This regenerates all version directories and updates navigation.

5. **Verify locally**:
   ```bash
   pnpm dev
   ```
   Check that the new version appears in the sidebar at http://localhost:3000

### Making Changes

**For OpenAPI spec changes:**
1. Edit the YAML file in `content/oas/portainer-ce/`
2. Run `pnpm tsx scripts/generate-docs.ts`
3. Verify with `pnpm dev`

**For site UI/functionality:**
1. Edit files in `src/`
2. Test with `pnpm dev`
3. Run `pnpm types` to check for type errors
4. Run `pnpm lint` before committing

**For hand-written documentation:**
1. Edit MDX files in `content/docs/getting-started/`
2. Verify with `pnpm dev`

## Important Constraints

### DO NOT
- Manually edit files in `content/docs/v*/` (these are generated)
- Commit `node_modules/`, `.next/`, or other build artifacts
- Add dependencies without running `pnpm types` afterward
- Make breaking changes to the OAS converter or doc generator without testing all versions

### DO
- Always regenerate docs after editing OpenAPI files
- Run type checks and linting before committing
- Test changes locally with `pnpm dev`
- Use the existing project structure and conventions
- Check that generated docs are git-tracked after regeneration

## Common Tasks

### Update Dependencies
```bash
pnpm update        # Update within package.json ranges
```

### Clean Rebuild
```bash
rm -rf .next node_modules
pnpm install
pnpm dev
```

### View Build Output
```bash
pnpm build         # Check for build errors
pnpm start         # Run production build locally
```

## Advanced Workflows

For complex, multi-step AI agent workflows, see `AGENTS.md` for detailed documentation on:
- The Ralph iterative agent loop system
- OAS converter pipeline details
- Doc generation internals
- Content structure conventions

## Testing

**Note:** This project currently has no automated test suite. Validate changes by:
1. Running `pnpm types` for type safety
2. Running `pnpm lint` for code quality
3. Running `pnpm dev` and manually testing in the browser
4. Running `pnpm build` to ensure production builds succeed

## Pull Request Guidelines

Before submitting a PR:
1. Run `pnpm lint` and fix any issues
2. Run `pnpm types` and resolve type errors
3. If you changed OpenAPI files, run `pnpm tsx scripts/generate-docs.ts`
4. Verify changes work with `pnpm dev`
5. Write a clear PR description explaining the change
6. Include screenshots for UI changes

## Project Goals

This project aims to:
- Provide clean, searchable Portainer API documentation
- Support both human developers and AI coding agents
- Enable version-aware API references
- Maintain a transparent, community-driven docs pipeline
- Lower friction for Portainer automation and development

---

For questions or contributions, see `README.md` and `AGENTS.md` for additional context.
