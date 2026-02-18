/**
 * End-to-end Swagger 2.0 → OpenAPI 3.1.0 converter with post-processing cleanup.
 *
 * Pipeline:
 *   1. Read & parse Swagger 2.0 YAML/JSON
 *   2. Text-level substitutions (configurable + built-in)
 *   3. Convert 2.0 → 3.0.0  (swagger2openapi, programmatic API)
 *   4. Upgrade 3.0.0 → 3.1.0 (schema transforms)
 *   5. Post-conversion cleanup (security schemes, servers, tags, x-tagGroups, etc.)
 *   6. Write output YAML
 *
 * Usage:
 *   pnpm tsx scripts/convert-to-oas31.ts <input> [output] [--config <cfg.json>]
 *
 *   <input>   Swagger 2.0 YAML or JSON file.
 *   [output]  Output YAML path. Defaults to <input-dir>/<oas-version>.yml
 *             (e.g. content/oas/my-api/3.1.0.yml).
 *
 * Config file (JSON) — loaded automatically from <input-basename>.config.json
 * or convert.config.json next to the input file, or via --config <path>:
 *
 *   {
 *     "serverDescription": "My API — relative to your instance base URL.",
 *     "tagDescriptions": { "auth": "Authenticate against the API." },
 *     "tagGroups": [{ "name": "Auth", "tags": ["auth"] }],
 *     "textReplacements": [{ "find": "old phrase", "replace": "new phrase" }]
 *   }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const s2o = require('swagger2openapi') as {
    convertObj: (
        swagger: Record<string, unknown>,
        options: Record<string, unknown>
    ) => Promise<{ openapi: Record<string, unknown> }>;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnyObject = Record<string, unknown>;

interface TagGroup {
    name: string;
    tags: string[];
}

interface ConvertConfig {
    /** Description added to every server entry that lacks one. */
    serverDescription?: string;
    /** Map of tag name → improved description string. */
    tagDescriptions?: Record<string, string>;
    /** x-tagGroups definition for Redocly / docs navigation grouping. */
    tagGroups?: TagGroup[];
    /**
     * Extra plain-string substitutions applied to the raw YAML before parsing.
     * Processed after the built-in substitutions.
     */
    textReplacements?: Array<{ find: string; replace: string }>;
}

// ---------------------------------------------------------------------------
// Step 2 – Text-level substitutions
// ---------------------------------------------------------------------------

/** Built-in substitutions that apply to any converted Swagger 2.0 file. */
const BUILTIN_REPLACEMENTS: Array<{ find: string; replace: string }> = [
    // Portainer's Swagger 2 used "environments(endpoints)" throughout
    { find: 'environments(endpoints)', replace: 'endpoints' },
    { find: 'environment(endpoint)', replace: 'endpoint' }
];

function applyTextReplacements(
    raw: string,
    extra: Array<{ find: string; replace: string }> = []
): string {
    for (const { find, replace } of [...BUILTIN_REPLACEMENTS, ...extra]) {
        raw = raw.split(find).join(replace);
    }
    return raw;
}

// ---------------------------------------------------------------------------
// Step 3 – swagger2openapi (Swagger 2.0 → OAS 3.0.0)
// ---------------------------------------------------------------------------

async function swaggerToOas30(swaggerDoc: AnyObject): Promise<AnyObject> {
    const result = await s2o.convertObj(swaggerDoc, {
        patch: true, // fix minor errors in source
        warnOnly: true, // don't throw on non-patchable issues
        anchors: true // preserve YAML anchors
    });
    return result.openapi as AnyObject;
}

// ---------------------------------------------------------------------------
// Step 4 – OAS 3.0.0 → 3.1.0 schema transforms
// ---------------------------------------------------------------------------

function walk(node: unknown, visitor: (obj: AnyObject) => void): void {
    if (Array.isArray(node)) {
        for (const item of node) walk(item, visitor);
    } else if (node !== null && typeof node === 'object') {
        visitor(node as AnyObject);
        for (const v of Object.values(node as AnyObject)) walk(v, visitor);
    }
}

function upgradeNode(node: AnyObject): void {
    // nullable: true  →  type: [<type>, "null"]  (JSON Schema 2020-12 alignment)
    if (node['nullable'] === true) {
        const t = node['type'];
        if (typeof t === 'string') {
            node['type'] = [t, 'null'];
        } else if (Array.isArray(t)) {
            if (!(t as string[]).includes('null')) (t as string[]).push('null');
        } else {
            const oo = node['oneOf'] as unknown[] | undefined;
            if (oo) oo.push({ type: 'null' });
            else node['oneOf'] = [{ type: 'null' }];
        }
        delete node['nullable'];
    }

    // exclusiveMinimum/Maximum: boolean form → numeric form
    if (typeof node['exclusiveMinimum'] === 'boolean') {
        if (
            node['exclusiveMinimum'] === true &&
            node['minimum'] !== undefined
        ) {
            node['exclusiveMinimum'] = node['minimum'];
            delete node['minimum'];
        } else {
            delete node['exclusiveMinimum'];
        }
    }
    if (typeof node['exclusiveMaximum'] === 'boolean') {
        if (
            node['exclusiveMaximum'] === true &&
            node['maximum'] !== undefined
        ) {
            node['exclusiveMaximum'] = node['maximum'];
            delete node['maximum'];
        } else {
            delete node['exclusiveMaximum'];
        }
    }

    // Remove swagger2openapi warning extensions
    for (const key of Object.keys(node)) {
        if (key.startsWith('x-s2o')) delete node[key];
    }
}

function upgradeToOas31(doc: AnyObject): AnyObject {
    doc['openapi'] = '3.1.0';
    walk(doc, upgradeNode);
    for (const key of Object.keys(doc)) {
        if (key.startsWith('x-s2o')) delete doc[key];
    }
    return doc;
}

// ---------------------------------------------------------------------------
// Step 5 – Post-conversion cleanup
// ---------------------------------------------------------------------------

function applyCleanup(doc: AnyObject, cfg: ConvertConfig): void {
    // ── Security schemes: upgrade JWT-as-apiKey → HTTP Bearer ───────────────
    const schemes = (doc['components'] as AnyObject | undefined)?.[
        'securitySchemes'
    ] as AnyObject | undefined;

    if (schemes) {
        for (const [name, scheme] of Object.entries(schemes)) {
            const s = scheme as AnyObject;
            // swagger2openapi emits Authorization bearer as apiKey-in-header
            if (
                s['type'] === 'apiKey' &&
                s['in'] === 'header' &&
                typeof s['name'] === 'string' &&
                (s['name'] as string).toLowerCase() === 'authorization'
            ) {
                delete s['in'];
                delete s['name'];
                s['type'] = 'http';
                s['scheme'] = 'bearer';
                if (
                    name.toLowerCase().includes('jwt') ||
                    name.toLowerCase().includes('bearer')
                ) {
                    s['bearerFormat'] = 'JWT';
                }
            }
        }
    }

    // ── Servers: add description where absent ────────────────────────────────
    if (cfg.serverDescription) {
        const servers = doc['servers'] as AnyObject[] | undefined;
        if (servers) {
            for (const srv of servers) {
                if (!srv['description'])
                    srv['description'] = cfg.serverDescription;
            }
        }
    }

    // ── Tags: apply custom descriptions ──────────────────────────────────────
    if (cfg.tagDescriptions) {
        const tags = doc['tags'] as
            | Array<{ name: string; description?: string }>
            | undefined;
        if (tags) {
            for (const tag of tags) {
                const override = cfg.tagDescriptions[tag.name];
                if (override !== undefined) tag.description = override;
            }
        }
    }

    // ── x-tagGroups ───────────────────────────────────────────────────────────
    if (cfg.tagGroups?.length) {
        doc['x-tagGroups'] = cfg.tagGroups;
    }
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function loadConfig(inputFile: string, explicitConfig?: string): ConvertConfig {
    const candidates: string[] = explicitConfig
        ? [path.resolve(explicitConfig)]
        : [
              path.join(
                  path.dirname(inputFile),
                  `${path.basename(inputFile, path.extname(inputFile))}.config.json`
              ),
              path.join(path.dirname(inputFile), 'convert.config.json')
          ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            log(`Config    ${candidate}`);
            return JSON.parse(
                fs.readFileSync(candidate, 'utf-8')
            ) as ConvertConfig;
        }
    }
    return {};
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function readRaw(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
}

function parseDoc(raw: string, filePath: string): AnyObject {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') return JSON.parse(raw) as AnyObject;
    return yaml.load(raw) as AnyObject;
}

function deriveOutputPath(inputFile: string, doc: AnyObject): string {
    const oasVersion = (doc['openapi'] as string | undefined) ?? '3.1.0';
    const safe = oasVersion.replace(/[^a-zA-Z0-9._-]/g, '-');
    return path.join(path.dirname(inputFile), `${safe}.yml`);
}

function writeOutput(filePath: string, doc: AnyObject): void {
    const out = yaml.dump(doc, {
        lineWidth: 120,
        noRefs: false,
        quotingType: '"',
        forceQuotes: false
    });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, out, 'utf-8');
}

function log(msg: string): void {
    process.stdout.write(`${msg}\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    let inputArg: string | undefined;
    let outputArg: string | undefined;
    let configArg: string | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--config' && args[i + 1]) {
            configArg = args[++i];
        } else if (!inputArg) {
            inputArg = args[i];
        } else if (!outputArg) {
            outputArg = args[i];
        }
    }

    if (!inputArg) {
        process.stderr.write(
            'Usage: pnpm tsx scripts/convert-to-oas31.ts <input.yml|json> [output.yml] [--config <cfg.json>]\n'
        );
        process.exit(1);
    }

    const inputFile = path.resolve(inputArg);
    if (!fs.existsSync(inputFile)) {
        process.stderr.write(`Error: file not found – ${inputFile}\n`);
        process.exit(1);
    }

    const cfg = loadConfig(inputFile, configArg);

    log(`Reading   ${inputFile}`);
    let raw = readRaw(inputFile);

    log(`Step 1/4  Applying text substitutions …`);
    raw = applyTextReplacements(raw, cfg.textReplacements);
    const swagger = parseDoc(raw, inputFile);

    const detectedVersion = String(
        (swagger['swagger'] as string | undefined) ??
            (swagger['openapi'] as string | undefined) ??
            '?'
    );
    log(`Detected  Swagger/OpenAPI version: ${detectedVersion}`);

    log(`Step 2/4  swagger2openapi → OAS 3.0.0 …`);
    const oas30 = await swaggerToOas30(swagger);

    log(`Step 3/4  Upgrading OAS 3.0.0 → 3.1.0 …`);
    const oas31 = upgradeToOas31(oas30);

    log(`Step 4/4  Applying post-conversion cleanup …`);
    applyCleanup(oas31, cfg);

    const outputFile = path.resolve(
        outputArg ?? deriveOutputPath(inputFile, oas31)
    );
    writeOutput(outputFile, oas31);
    log(`Done      ${outputFile}`);
}

main().catch(err => {
    process.stderr.write(`Fatal: ${(err as Error).message}\n`);
    process.exit(1);
});
