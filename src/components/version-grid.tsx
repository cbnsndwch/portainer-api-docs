import { Cards, Card } from 'fumadocs-ui/components/card';
import { promises as fs } from 'fs';
import path from 'path';

async function getVersions(edition: 'ce' | 'be') {
  const dir = path.join(process.cwd(), `content/oas/portainer-${edition}`);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .map(file => file.replace(/\.ya?ml$/, ''))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
  } catch (error) {
    // If directory doesn't exist, return empty array
    return [];
  }
}

export async function VersionGrid() {
  const ceVersions = await getVersions('ce');
  const beVersions = await getVersions('be');

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="text-xl font-bold mb-4">Portainer CE</h3>
        {ceVersions.length > 0 ? (
          <Cards>
            {ceVersions.map((version) => (
              <Card
                key={version}
                href={`/docs/v${version}`}
                title={`Version ${version}`}
                description="View API documentation"
              />
            ))}
          </Cards>
        ) : (
          <p className="text-muted-foreground">No CE versions available.</p>
        )}
      </section>

      <section>
        <h3 className="text-xl font-bold mb-4">Portainer BE</h3>
        {beVersions.length > 0 ? (
          <Cards>
            {beVersions.map((version) => (
              <Card
                key={version}
                href={`/docs/be/v${version}`}
                title={`Version ${version}`}
                description="Business Edition API documentation"
              />
            ))}
          </Cards>
        ) : (
          <div className="p-4 border rounded-lg bg-muted/50 text-muted-foreground text-sm">
            Business Edition documentation is coming soon.
          </div>
        )}
      </section>
    </div>
  );
}
