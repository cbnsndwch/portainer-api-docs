import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

import { APIPage } from '@/components/api-page';
import { VersionGrid } from '@/components/version-grid';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
    return {
        ...defaultMdxComponents,
        APIPage,
        VersionGrid,
        ...components
    };
}
