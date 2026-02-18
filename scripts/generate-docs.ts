import { generateFilesOnly, type OperationOutput } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as yaml from 'js-yaml';

type OutputFile = {
    path: string;
    content: string;
};

/** Metadata extracted from an OAS file for use during doc generation. */
type SpecMeta = {
    title: string;
    description: string;
    /** tag name → display label (from tags[].name, prettified) */
    tagLabels: Map<string, string>;
    /** tag name → description string */
    tagDescriptions: Map<string, string>;
    /**
     * Ordered flat list of tag names derived from x-tagGroups.
     * Tags not in any group are appended alphabetically at the end.
     */
    tagOrder: string[];
    /** raw schemas from components.schemas */
    schemas: Record<string, any>;
};

const OAS_DIR = path.resolve(process.cwd(), 'content/oas/portainer-ce');
const DOCS_DIR = path.resolve(process.cwd(), 'content/docs');

function toSlug(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

function toTitleFromSlug(slug: string): string {
    return slug
        .split('-')
        .filter(Boolean)
        .map(part => part[0]?.toUpperCase() + part.slice(1))
        .join(' ');
}

async function loadSpecMeta(filePath: string): Promise<SpecMeta> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const doc = yaml.load(raw) as Record<string, unknown>;

    const info = (doc['info'] ?? {}) as Record<string, unknown>;
    const title = String(info['title'] ?? '');
    const description = String(info['description'] ?? '');

    const tagLabels = new Map<string, string>();
    const tagDescriptions = new Map<string, string>();
    const rawTags = (doc['tags'] ?? []) as Array<{
        name: string;
        description?: string;
    }>;
    for (const tag of rawTags) {
        tagLabels.set(tag.name, toTitleFromSlug(toSlug(tag.name)));
        if (tag.description) tagDescriptions.set(tag.name, tag.description);
    }

    // Build ordered tag list from x-tagGroups, then append any remaining tags
    const tagGroups = (doc['x-tagGroups'] ?? []) as Array<{
        name: string;
        tags: string[];
    }>;
    const seen = new Set<string>();
    const tagOrder: string[] = [];
    for (const group of tagGroups) {
        for (const t of group.tags) {
            if (!seen.has(t)) {
                tagOrder.push(t);
                seen.add(t);
            }
        }
    }
    for (const tag of rawTags) {
        if (!seen.has(tag.name)) {
            tagOrder.push(tag.name);
            seen.add(tag.name);
        }
    }

    const components = (doc['components'] ?? {}) as Record<string, any>;
    const schemas = (components['schemas'] ?? {}) as Record<string, any>;

    return {
        title,
        description,
        tagLabels,
        tagDescriptions,
        tagOrder,
        schemas
    };
}

function toVersionFolder(version: string): string {
    return version.startsWith('v') ? version : `v${version}`;
}

function toVersionDisplay(versionFolder: string): string {
    return `CE ${versionFolder}`;
}

function getVersionFromSchemaId(schemaId: string): string {
    const [, version = schemaId] = schemaId.split('/');
    return version;
}

function endpointFileName(routePath: string, method: string): string {
    const routeSlug = toSlug(routePath.replace(/\//g, '-')) || 'root';
    return `${method.toLowerCase()}-${routeSlug}.mdx`;
}

async function discoverSpecs() {
    const entries = await fs.readdir(OAS_DIR, { withFileTypes: true });
    const specs = await Promise.all(
        entries
            .filter(entry => entry.isFile())
            .filter(entry => /\.ya?ml$/i.test(entry.name))
            .map(async entry => {
                const filePath = path.join(OAS_DIR, entry.name);
                const raw = await fs.readFile(filePath, 'utf-8');
                const doc = yaml.load(raw) as Record<string, unknown>;
                const info = (doc['info'] ?? {}) as Record<string, unknown>;
                const version = String(
                    info['version'] ??
                        path.basename(entry.name, path.extname(entry.name))
                );

                const versionFolder = toVersionFolder(version);

                return {
                    rawVersion: version,
                    versionFolder,
                    schemaId: `ce/${version}`,
                    filePath
                };
            })
    );

    specs.sort((a, b) =>
        a.rawVersion.localeCompare(b.rawVersion, undefined, {
            numeric: true,
            sensitivity: 'base'
        })
    );

    if (specs.length === 0) {
        throw new Error(`No OpenAPI files found in ${OAS_DIR}`);
    }

    return specs;
}

async function readRootPages(): Promise<string[]> {
    try {
        const content = await fs.readFile(
            path.join(DOCS_DIR, 'meta.json'),
            'utf8'
        );
        const parsed = JSON.parse(content) as { pages?: string[] };
        return parsed.pages ?? [];
    } catch {
        return [];
    }
}

async function writeGeneratedStructure(files: OutputFile[]) {
    await Promise.all(
        files.map(async file => {
            const filePath = path.join(DOCS_DIR, file.path);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, file.content);
            console.log(`Generated: ${filePath}`);
        })
    );
}

async function main() {
    const specs = await discoverSpecs();
    const existingRootPages = await readRootPages();

    await Promise.all(
        specs.map(spec =>
            fs.rm(path.join(DOCS_DIR, spec.versionFolder), {
                recursive: true,
                force: true
            })
        )
    );

    // Pre-load spec metadata (tags, descriptions, x-tagGroups) for all specs
    const specMetaByVersion = new Map<string, SpecMeta>();
    await Promise.all(
        specs.map(async spec => {
            const meta = await loadSpecMeta(spec.filePath);
            specMetaByVersion.set(spec.versionFolder, meta);
        })
    );

    const input = createOpenAPI({
        input: () =>
            Object.fromEntries(
                specs.map(spec => [spec.schemaId, spec.filePath])
            )
    });

    const files = await generateFilesOnly({
        input,
        includeDescription: true,
        per: 'custom',
        toPages(builder) {
            const items = builder.extract();
            // Debugging what is available in items
            // console.log('Builder extracted items keys:', Object.keys(items));

            // Try to access the document to get schemas directly if items doesn't have them
            // console.log('Builder keys:', Object.keys(builder));

            const schemas = (items as any).schemas;

            if (schemas) {
                for (const [name, schema] of Object.entries(schemas)) {
                    // Logic to process schemas will go here
                    // console.log(`Schema found: ${name}`);
                }
            }

            for (const op of items.operations) {
                const operationInfo = builder.fromExtractedOperation(op);
                if (!operationInfo) continue;

                const { pathItem, operation, displayName } = operationInfo;
                const version = getVersionFromSchemaId(builder.id);
                const versionFolder = toVersionFolder(version);
                const primaryTag = operation.tags?.[0] ?? 'untagged';
                const tagSlug = toSlug(primaryTag) || 'untagged';

                const entry: OperationOutput = {
                    type: 'operation',
                    schemaId: builder.id,
                    item: op,
                    path: path.join(
                        versionFolder,
                        'endpoints',
                        tagSlug,
                        endpointFileName(op.path, op.method)
                    ),
                    info: {
                        title: displayName,
                        description:
                            operation.description ?? pathItem.description
                    }
                };

                builder.create(entry);
            }
        },
        async beforeWrite(generatedFiles) {
            const versionFolders = new Set<string>();
            const tagToPages = new Map<string, Set<string>>();

            for (const file of generatedFiles) {
                const parts = file.path.split('/');
                if (parts.length < 4 || parts[1] !== 'endpoints') continue;

                const [versionFolder, , tagSlug, pageFile] = parts;
                versionFolders.add(versionFolder);

                const pageSlug = pageFile.replace(/\.mdx$/, '');
                const key = `${versionFolder}/${tagSlug}`;

                const pages = tagToPages.get(key) ?? new Set<string>();
                pages.add(pageSlug);
                tagToPages.set(key, pages);
            }

            for (const versionFolder of versionFolders) {
                const specMeta = specMetaByVersion.get(versionFolder);

                // --- SCHEMA GENERATION START ---
                const schemas = specMeta?.schemas ?? {};
                const schemaPagesByTag = new Map<string, string[]>();

                for (const [schemaName, schema] of Object.entries(schemas)) {
                    let tag = 'untagged';
                    if (
                        schema['x-tags'] &&
                        Array.isArray(schema['x-tags']) &&
                        schema['x-tags'].length > 0
                    ) {
                        tag = schema['x-tags'][0];
                    } else {
                        // Match by name prefix
                        // e.g. auth.authenticatePayload -> auth
                        const parts = schemaName.split('.');
                        if (parts.length > 1) {
                            tag = parts[0];
                        }
                    }

                    const tagSlug = toSlug(tag);
                    const schemaPageSlug = toSlug(schemaName);

                    const schemaTitle = schema.title ?? schemaName;
                    const schemaDescription = schema.description ?? '';

                    // Create schema page content
                    const content = `---
title: ${JSON.stringify(schemaTitle)}
---

${schemaDescription}

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`
`;

                    generatedFiles.push({
                        path: path.join(
                            versionFolder,
                            'entities',
                            tagSlug,
                            `${schemaPageSlug}.mdx`
                        ),
                        content
                    });

                    const pages = schemaPagesByTag.get(tagSlug) ?? [];
                    pages.push(schemaPageSlug);
                    schemaPagesByTag.set(tagSlug, pages);
                }
                // --- SCHEMA GENERATION END ---

                const indexDescription = specMeta?.description
                    ? specMeta.description.trim()
                    : `Generated API reference for ${versionFolder}. Use the Entities and Endpoints sections in the sidebar to browse service groups and endpoints.`;

                generatedFiles.push({
                    path: path.join(versionFolder, 'index.mdx'),
                    content:
                        `---\n` +
                        `title: ${JSON.stringify(toVersionDisplay(versionFolder))}\n` +
                        `---\n\n` +
                        `${indexDescription}\n`
                });

                generatedFiles.push({
                    path: path.join(versionFolder, 'meta.json'),
                    content: JSON.stringify(
                        {
                            root: true,
                            title: toVersionDisplay(versionFolder),
                            pages: ['entities', 'endpoints']
                        },
                        null,
                        4
                    )
                });

                const allTagSlugs = Array.from(
                    new Set([
                        ...Array.from(tagToPages.keys())
                            .filter(key => key.startsWith(`${versionFolder}/`))
                            .map(key => key.split('/')[1]),
                        ...Array.from(schemaPagesByTag.keys())
                    ])
                );

                // Order by x-tagGroups order from the spec, fall back to alpha
                const orderedTagNames = specMeta?.tagOrder ?? [];
                const slugFromTagName = (name: string) => toSlug(name) || name;
                const tags = [
                    ...orderedTagNames
                        .map(slugFromTagName)
                        .filter(s => allTagSlugs.includes(s)),
                    ...allTagSlugs
                        .filter(
                            s =>
                                !orderedTagNames
                                    .map(slugFromTagName)
                                    .includes(s)
                        )
                        .sort((a, b) => a.localeCompare(b))
                ];

                generatedFiles.push({
                    path: path.join(versionFolder, 'entities', 'meta.json'),
                    content: JSON.stringify(
                        {
                            title: 'Entities',
                            pages: tags
                        },
                        null,
                        4
                    )
                });

                generatedFiles.push({
                    path: path.join(versionFolder, 'endpoints', 'meta.json'),
                    content: JSON.stringify(
                        {
                            title: 'Endpoints',
                            pages: tags.filter(tagSlug =>
                                tagToPages.has(`${versionFolder}/${tagSlug}`)
                            )
                        },
                        null,
                        4
                    )
                });

                for (const tagSlug of tags) {
                    const pages = Array.from(
                        tagToPages.get(`${versionFolder}/${tagSlug}`) ?? []
                    ).sort((a, b) => a.localeCompare(b));

                    // Resolve display title: prefer spec tag name prettified, fall back to slug
                    const originalTagName =
                        specMeta?.tagOrder.find(t => toSlug(t) === tagSlug) ??
                        tagSlug;
                    const entityTitle =
                        specMeta?.tagLabels.get(originalTagName) ??
                        toTitleFromSlug(tagSlug);
                    const entityDescription =
                        specMeta?.tagDescriptions.get(originalTagName) ??
                        `${entityTitle} entities for ${versionFolder}.`;

                    generatedFiles.push({
                        path: path.join(
                            versionFolder,
                            'entities',
                            tagSlug,
                            'overview.mdx'
                        ),
                        content:
                            `---\n` +
                            `title: ${JSON.stringify(entityTitle)}\n` +
                            `---\n\n` +
                            `${entityDescription}\n`
                    });

                    const schemaPages = schemaPagesByTag.get(tagSlug) ?? [];
                    const entityPages = [
                        'overview',
                        ...schemaPages.sort((a, b) => a.localeCompare(b))
                    ];

                    generatedFiles.push({
                        path: path.join(
                            versionFolder,
                            'entities',
                            tagSlug,
                            'meta.json'
                        ),
                        content: JSON.stringify(
                            { title: entityTitle, pages: entityPages },
                            null,
                            4
                        )
                    });

                    generatedFiles.push({
                        path: path.join(
                            versionFolder,
                            'endpoints',
                            tagSlug,
                            'meta.json'
                        ),
                        content: JSON.stringify(
                            { title: entityTitle, pages },
                            null,
                            4
                        )
                    });
                }
            }

            const nonVersionPages = existingRootPages.filter(
                page => !/^v\d/.test(page)
            );
            const sortedVersions = Array.from(versionFolders).sort((a, b) =>
                b.localeCompare(a, undefined, {
                    numeric: true,
                    sensitivity: 'base'
                })
            );

            generatedFiles.push({
                path: 'meta.json',
                content: JSON.stringify(
                    {
                        pages: [...nonVersionPages, ...sortedVersions]
                    },
                    null,
                    4
                )
            });
        }
    });

    await writeGeneratedStructure(files as OutputFile[]);
}

main();
