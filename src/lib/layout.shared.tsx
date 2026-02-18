import { Fragment } from 'react';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import type { DocsLayoutProps } from 'fumadocs-ui/layouts/docs';
import { HomeIcon, TagIcon } from 'lucide-react';

import './layout.shared.css';

// Map root folders to custom colors (CSS variables)
const COLORS: Record<string, string> = {
    architecture: 'var(--brain-color, #6366f1)',
    conventions: 'var(--conventions-color, #f97316)',
    ops: 'var(--ops-color, #10b981)',
    reference: 'var(--reference-color, #3b82f6)'
};

// fill this with your actual GitHub info, for example:
export const gitConfig = {
    user: 'cbnsndwch',
    repo: 'portainer-ce-api-docs',
    branch: 'main'
};

export function baseOptions(): BaseLayoutProps {
    return {
        nav: {
            title: 'Portainer CE API Docs'
        },
        githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`
    };
}

export function docsOptions(): Omit<DocsLayoutProps, 'tree' | 'children'> {
    return {
        ...baseOptions(),

        tabMode: 'auto',
        sidebar: {
            collapsible: true,
            tabs: {
                transform(option, node) {
                    // Get the root folder name for custom styling
                    // e.g.: /docs/getting-started/... -> "getting-started"
                    const rootFolder = option.url.split('/')[2];

                    const color = 'var(--color-fd-foreground)';

                    let sectionIcon: React.ReactNode | undefined;
                    if (typeof node.icon === 'string') {
                        sectionIcon = (
                            <div className="rounded-md p-1" style={{ color }}>
                                <span>{sectionIcon}</span>
                            </div>
                        );
                    } else if (rootFolder === 'getting-started') {
                        sectionIcon = (
                            <HomeIcon className="tab-icon" style={{ color }} />
                        );
                    } else {
                        sectionIcon = (
                            <TagIcon className="tab-icon" style={{ color }} />
                        );
                    }

                    return {
                        ...option,
                        icon: (
                            <div
                                className="tab-icon"
                                style={
                                    {
                                        '--tab-color': color
                                    } as object
                                }
                            >
                                {sectionIcon}
                            </div>
                        )
                    };
                }
            }
        }
    } satisfies Omit<DocsLayoutProps, 'tree' | 'children'>;
}
