import { createOpenAPI } from 'fumadocs-openapi/server';
import path from 'node:path';
import { readdirSync } from 'node:fs';

const oasDir = path.resolve(process.cwd(), 'content/oas/portainer-ce');

function getSchemas() {
    const entries = readdirSync(oasDir, { withFileTypes: true });

    return Object.fromEntries(
        entries
            .filter(entry => entry.isFile())
            .filter(entry => /\.ya?ml$/i.test(entry.name))
            .map(entry => {
                const version = path.basename(
                    entry.name,
                    path.extname(entry.name)
                );
                return [`ce/${version}`, path.join(oasDir, entry.name)];
            })
    );
}

export const openapi = createOpenAPI({
    input: getSchemas
});
