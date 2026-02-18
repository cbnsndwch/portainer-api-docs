import { createAPIPage } from 'fumadocs-openapi/ui';
import { APIPlayground } from 'fumadocs-openapi/playground';
import { openapi } from '@/lib/openapi';
import client from './api-page.client';
import { CustomPlayground } from './custom-playground';

export const APIPage = createAPIPage(openapi, {
    client,
    playground: {
        render: async (props) => {
            const playgroundElement = await APIPlayground(props);
            
            // Extract props from the server-rendered playground component
            // This relies on APIPlayground returning a React Element with props
            if (
                playgroundElement && 
                typeof playgroundElement === 'object' && 
                'props' in playgroundElement
            ) {
                const originalProps = (playgroundElement as any).props;
                
                // Try to get the server URL from the OAS definition
                // The context might have the full document or schema
                // We'll default to '/api' if not found
                // Note: ctx.schema is the operation schema, but we might need the root document
                // fumadocs-openapi likely provides the root doc somewhere, or we assume defaults
                // Let's check if we can access the servers from the context
                
                // For now, default to /api as seen in the OAS file
                let initialBaseUrl = '/api';
                
                // Attempt to read from context if available (this is best effort)
                // @ts-ignore
                const servers = props.ctx?.schema?.dereferenced?.servers || props.ctx?.document?.servers;
                if (Array.isArray(servers) && servers.length > 0 && servers[0].url) {
                    initialBaseUrl = servers[0].url;
                }

                return (
                    <CustomPlayground 
                        {...originalProps}
                        initialBaseUrl={initialBaseUrl}
                    />
                );
            }
            
            return playgroundElement;
        }
    }
});
