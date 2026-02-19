import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
    reactStrictMode: true,
    allowedDevOrigins: ['10.0.0.207'],
    async redirects() {
        return [
            {
                source: '/',
                destination: '/docs',
                permanent: false
            }
        ];
    },
    async rewrites() {
        return [
            {
                source: '/docs/:path*.mdx',
                destination: '/llms.mdx/docs/:path*'
            }
        ];
    }
};

export default withMDX(config);
