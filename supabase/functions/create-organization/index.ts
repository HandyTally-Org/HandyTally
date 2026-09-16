// supabase/functions/create-organization/index.ts
//
// Creates a tenant: validates the subdomain, inserts the organizations row and
// returns it. Nothing else needs provisioning (HT-31): every *.handytally.com
// host is served by the one Cloudflare Worker behind a wildcard DNS record
// (HT-37), so there is no per-tenant DNS record, hosting project or deploy.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateOrgRequest {
    name: string;
    subdomain: string;
}

function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Initialize Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify authentication
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return json({ error: 'No authorization header' }, 401);
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return json({ error: 'Unauthorized: Invalid token' }, 401);
        }

        // Verify superuser permissions
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('role, is_active')
            .eq('id', user.id)
            .single();

        if (profileError || !profile || profile.role !== 'superuser' || !profile.is_active) {
            return json({ error: 'Insufficient permissions: Superuser access required' }, 403);
        }

        // Parse and validate request
        const requestBody: CreateOrgRequest = await req.json();
        const { name, subdomain } = requestBody;

        if (!name || !subdomain) {
            return json({ error: 'Name and subdomain are required' }, 400);
        }

        // Validate subdomain format
        const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
        if (!subdomainRegex.test(subdomain) || subdomain.length < 3 || subdomain.length > 63) {
            return json({
                error: 'Invalid subdomain format. Use 3-63 characters: lowercase letters, numbers, and hyphens (not at start/end).'
            }, 400);
        }

        // Check for reserved subdomains
        const reservedSubdomains = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost', 'staging', 'test'];
        if (reservedSubdomains.includes(subdomain)) {
            return json({ error: 'Subdomain is reserved and cannot be used' }, 400);
        }

        // Check if subdomain already exists
        const { data: existingOrg } = await supabase
            .from('organizations')
            .select('id')
            .eq('subdomain', subdomain)
            .single();

        if (existingOrg) {
            return json({ error: 'Subdomain already exists' }, 409);
        }

        const baseDomain = Deno.env.get('BASE_DOMAIN') || 'handytally.com';
        const cleanSubdomain = subdomain.toLowerCase().trim();
        const fullDomain = `${cleanSubdomain}.${baseDomain}`;

        console.log(`Creating organization: ${name} at ${fullDomain}`);

        // The wildcard route serves the host as soon as the row exists, so the
        // organization is active immediately.
        const { data: organization, error: orgError } = await supabase
            .from('organizations')
            .insert({
                name: name.trim(),
                subdomain: cleanSubdomain,
                domain: fullDomain,
                status: 'active'
            })
            .select()
            .single();

        if (orgError) {
            console.error('Error creating organization:', orgError);
            return json({ error: 'Failed to create organization', details: orgError.message }, 500);
        }

        return json({
            success: true,
            organization,
            domain: fullDomain
        }, 201);

    } catch (error) {
        console.error('Unexpected error:', error);
        return json({ error: 'Internal server error', details: error.message }, 500);
    }
});
