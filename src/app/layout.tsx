import { RootProvider } from 'fumadocs-ui/provider/next';
import { Analytics } from '@vercel/analytics/next';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';

const inter = Inter({
    subsets: ['latin']
});

const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000');

const siteName = '[CBN] Portainer API Docs';
const siteDescription =
    'Unofficial, community-maintained API documentation for Portainer CE and BE.';

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: siteName,
        template: `%s | ${siteName}`
    },
    description: siteDescription,
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/favicon.ico', type: 'image/x-icon' }
        ],
        shortcut: ['/favicon.ico'],
        apple: [{ url: '/favicon.ico' }]
    },
    openGraph: {
        type: 'website',
        url: siteUrl,
        siteName,
        title: siteName,
        description: siteDescription,
        images: [
            {
                url: '/opengraph-image.png',
                width: 1200,
                height: 630,
                alt: siteName
            }
        ]
    },
    twitter: {
        card: 'summary_large_image',
        title: siteName,
        description: siteDescription,
        images: ['/twitter-image.png']
    }
};

export default function Layout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en" className={inter.className} suppressHydrationWarning>
            <body className="flex flex-col min-h-screen">
                <RootProvider>{children}</RootProvider>
                <Analytics />
            </body>
        </html>
    );
}
