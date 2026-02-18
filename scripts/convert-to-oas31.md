# convert-to-oas31

End-to-end pipeline that converts a **Swagger 2.0** (YAML or JSON) spec to a clean **OpenAPI 3.1.0** YAML file.

## Usage

```sh
pnpm convert-oas <input> [output] [--config <config.json>]
```

| Argument          | Required | Description                                                                    |
| ----------------- | -------- | ------------------------------------------------------------------------------ |
| `<input>`         | Yes      | Path to the Swagger 2.0 `.yml` or `.json` source file.                         |
| `[output]`        | No       | Destination YAML path. Defaults to `<input-dir>/3.1.0.yml`.                    |
| `--config <path>` | No       | Path to a [config file](#config-file). Auto-detected when omitted (see below). |

### Examples

```sh
# Convert and auto-name the output 3.1.0.yml next to the input
pnpm convert-oas content/oas/my-api/swagger.yml

# Explicit output path
pnpm convert-oas content/oas/my-api/swagger.yml content/oas/my-api/3.1.0.yml

# Explicit config path
pnpm convert-oas swagger.yml out.yml --config my-api.config.json
```

---

## Pipeline

The script runs four steps in order:

```log
Step 1/4  Text substitutions      (built-in + config)
Step 2/4  swagger2openapi         (Swagger 2.0 → OAS 3.0.0)
Step 3/4  OAS 3.0 → 3.1 upgrade   (schema transforms)
Step 4/4  Post-conversion cleanup (security, servers, tags, x-tagGroups)
```

### Step 1 — Text substitutions

Plain-string find/replace applied to the raw YAML **before** parsing.

Built-in substitutions (always applied):

| Find                      | Replace     |
| ------------------------- | ----------- |
| `environments(endpoints)` | `endpoints` |
| `environment(endpoint)`   | `endpoint`  |

Additional substitutions can be provided via [`textReplacements`](#textreplacements) in the config file.

### Step 2 — swagger2openapi

Uses the [`swagger2openapi`](https://github.com/Mermade/oas-kit) library (programmatic API) to convert the Swagger 2.0 document to OpenAPI 3.0.0. Options applied:

- `patch: true` — automatically fixes minor errors in the source.
- `warnOnly: true` — non-patchable issues are surfaced as warnings rather than fatal errors.

### Step 3 — OAS 3.0 → 3.1 upgrade

Applies the following JSON-Schema-alignment transforms to every node in the document tree:

| OAS 3.0                            | OAS 3.1                                       |
| ---------------------------------- | --------------------------------------------- |
| `nullable: true` on a typed schema | `type: ["<type>", "null"]`                    |
| `nullable: true` without a `type`  | `oneOf: [..., { type: "null" }]`              |
| `exclusiveMinimum: true` (boolean) | `exclusiveMinimum: <minimum value>` (numeric) |
| `exclusiveMaximum: true` (boolean) | `exclusiveMaximum: <maximum value>` (numeric) |
| `x-s2o-*` extension keys           | Removed                                       |

### Step 4 — Post-conversion cleanup

Applies structural improvements driven by the [config file](#config-file):

- **Security schemes** — `apiKey`-in-`Authorization`-header schemes are automatically retyped to `http / bearer` (with `bearerFormat: JWT` when the scheme name suggests JWT). No config needed.
- **Servers** — adds `description` to every server entry that lacks one, using `serverDescription` from config.
- **Tags** — replaces tag descriptions using `tagDescriptions` from config.
- **x-tagGroups** — adds the `x-tagGroups` extension (used by Redocly and compatible renderers for navigation grouping) using `tagGroups` from config.

---

## Config file

A JSON file that controls Steps 1 and 4. The script auto-loads it when it finds one of these files next to the input:

1. `<input-basename>.config.json` — e.g. `swagger.config.json` for `swagger.yml`
2. `convert.config.json` — shared config for all specs in that directory

Use `--config <path>` to point to a file elsewhere.

### Schema

```jsonc
{
    // Description added to server entries that have none.
    "serverDescription": "My API — base URL is your instance hostname.",

    // Map of tag name → description. Overrides whatever was in the source spec.
    "tagDescriptions": {
        "auth": "Authenticate against the API.",
        "users": "Manage users."
    },

    // x-tagGroups — groups tags in the navigation sidebar.
    // Supported by Redocly, Scalar, and many other rendering tools.
    "tagGroups": [
        { "name": "Authentication", "tags": ["auth"] },
        { "name": "Administration", "tags": ["users", "teams"] }
    ],

    // Extra plain-string find/replace applied before parsing (after built-ins).
    "textReplacements": [
        { "find": "legacy phrase", "replace": "modern phrase" }
    ]
}
```

### Portainer CE config

The Portainer CE config lives at [content/oas/portainer-ce/convert.config.json](../content/oas/portainer-ce/convert.config.json). It defines tag descriptions and `x-tagGroups` for all 33 Portainer API tags. Any future Portainer Swagger release can be converted by placing its file in `content/oas/portainer-ce/` and running:

```sh
pnpm convert-oas content/oas/portainer-ce/<version>.yml
```

---

## Adding a new API

1. Create a directory under `content/oas/`, e.g. `content/oas/my-api/`.
2. Place the Swagger 2.0 source file there.
3. Optionally create `content/oas/my-api/convert.config.json` with `tagDescriptions`, `tagGroups`, and `serverDescription` for that API.
4. Run:

    ```sh
    pnpm convert-oas content/oas/my-api/<swagger-file>.yml
    ```

5. The converted `3.1.0.yml` is written to the same directory.

---

## Dependencies

| Package                                                            | Purpose                                    |
| ------------------------------------------------------------------ | ------------------------------------------ |
| [`swagger2openapi`](https://www.npmjs.com/package/swagger2openapi) | Swagger 2.0 → OAS 3.0.0 conversion         |
| [`js-yaml`](https://www.npmjs.com/package/js-yaml)                 | YAML parsing and serialisation             |
| [`tsx`](https://www.npmjs.com/package/tsx)                         | Running TypeScript directly via `pnpm tsx` |
