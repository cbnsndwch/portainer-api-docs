'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { PlaygroundClientProps } from 'fumadocs-openapi/playground/client';

// Lazy load the PlaygroundClient to avoid server-side rendering issues with browser APIs if any
const PlaygroundClient = dynamic(
    () => import('fumadocs-openapi/playground/client'),
    { ssr: false }
);

interface CustomPlaygroundProps extends PlaygroundClientProps {
    initialBaseUrl?: string;
}

export function CustomPlayground({
    route,
    initialBaseUrl = '/api', // Default fallback
    ...props
}: CustomPlaygroundProps) {
    // Initialize mounted state - will be set to true after first render
    const [mounted, setMounted] = useState(false);
    
    // Initialize baseUrl from localStorage if available, otherwise use initialBaseUrl
    const [baseUrl, setBaseUrl] = useState(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('portainer_api_url');
            return stored || initialBaseUrl;
        }
        return initialBaseUrl;
    });

    // Set mounted to true after first render
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Necessary to avoid hydration mismatch
        setMounted(true);
    }, []);

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUrl = e.target.value;
        setBaseUrl(newUrl);
        localStorage.setItem('portainer_api_url', newUrl);
    };

    // Construct the full URL
    // If route is absolute, we might want to respect it?
    // But here we assume route is relative (from OAS path) and we prepend baseUrl.
    // Actually, route passed from APIPlayground is likely the path from the OAS key (e.g. /auth).
    // We want to join baseUrl + route.
    // Be careful with slashes.

    const cleanBase = baseUrl.replace(/\/$/, '');
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    const fullUrl = `${cleanBase}${cleanRoute}`;

    if (!mounted) {
        return (
            <div className="p-4 border rounded-lg bg-card text-card-foreground">
                Loading playground...
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 p-4 border rounded-lg bg-card text-card-foreground">
                <label htmlFor="base-url-input" className="text-sm font-medium">
                    Server URL
                </label>
                <input
                    id="base-url-input"
                    type="text"
                    value={baseUrl}
                    onChange={handleUrlChange}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="https://portainer.example.com/api"
                />
                <p className="text-xs text-muted-foreground">
                    Enter the URL of your Portainer instance (e.g.{' '}
                    <code>https://localhost:9443/api</code> or{' '}
                    <code>https://portainer.io/api</code>).
                </p>
            </div>

            <PlaygroundClient route={fullUrl} {...props} />
        </div>
    );
}
