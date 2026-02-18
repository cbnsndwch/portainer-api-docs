Great! Now let's commit these changes in thematic groups with short messages that follow the repo's semantic conventions.

## Commit Message Convention

Use the format: `type(scope): message`

**Types:**

- `feat`: New feature or component
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `build`: Changes to build system or dependencies (package.json, tsconfig, etc.)
- `chore`: Maintenance tasks (lockfile updates, etc.)
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `perf`: Performance improvements
- `style`: Code style changes (formatting, semicolons, etc.)

**Scope Examples:**

- Directories: `scripts`, `content`, `src`, `oas`
- Specific areas: `components`, `lib`, `app`, `layout`
- Scripts: `convert-oas`, `generate-docs`
- Config: `next`, `tailwind`, `eslint`, `tsconfig`

**Message Guidelines:**

- Use imperative mood ("add" not "added", "migrate" not "migrated")
- Keep under 72 characters
- Be specific but concise
- No period at the end

**Grouping Strategy:**

1. **Feature additions** - New components/files created
2. **Refactors/Updates** - Exports, imports, structural changes
3. **Build changes** - Dependencies, package.json, build config
4. **Lockfile** - Always separate commit for package-lock.json
5. **Documentation** - README, migration docs, comments

**Examples:**

```
feat(ui): add new Accordion component
refactor(map): optimize geojson rendering
fix(sections): correct Hero section padding on mobile
build(deps): update vite
chore(data): update events.json
```


Review the current 'git status' and 'git diff'. Commit the changes based on the convention above. If there are multiple logical changes, make multiple commits.