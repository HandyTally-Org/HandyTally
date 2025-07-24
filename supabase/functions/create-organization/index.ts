// supabase/functions/create-organization/index.ts - Production Ready
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

interface AWSCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    hostedZoneId: string;
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
            return new Response(
                JSON.stringify({ error: 'No authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Verify superuser permissions
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('role, is_active')
            .eq('id', user.id)
            .single();

        if (profileError || !profile || profile.role !== 'superuser' || !profile.is_active) {
            return new Response(
                JSON.stringify({ error: 'Insufficient permissions: Superuser access required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse and validate request
        const requestBody: CreateOrgRequest = await req.json();
        const { name, subdomain } = requestBody;

        if (!name || !subdomain) {
            return new Response(
                JSON.stringify({ error: 'Name and subdomain are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate subdomain format
        const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
        if (!subdomainRegex.test(subdomain) || subdomain.length < 3 || subdomain.length > 63) {
            return new Response(
                JSON.stringify({
                    error: 'Invalid subdomain format. Use 3-63 characters: lowercase letters, numbers, and hyphens (not at start/end).'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check for reserved subdomains
        const reservedSubdomains = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost', 'staging', 'test'];
        if (reservedSubdomains.includes(subdomain)) {
            return new Response(
                JSON.stringify({ error: 'Subdomain is reserved and cannot be used' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check if subdomain already exists
        const { data: existingOrg } = await supabase
            .from('organizations')
            .select('id')
            .eq('subdomain', subdomain)
            .single();

        if (existingOrg) {
            return new Response(
                JSON.stringify({ error: 'Subdomain already exists' }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`Creating organization: ${name} with subdomain: ${subdomain}`);

        // Create organization record
        const { data: organization, error: orgError } = await supabase
            .from('organizations')
            .insert({
                name: name.trim(),
                subdomain: subdomain.toLowerCase().trim(),
                status: 'pending'
            })
            .select()
            .single();

        if (orgError) {
            console.error('Error creating organization:', orgError);
            return new Response(
                JSON.stringify({ error: 'Failed to create organization', details: orgError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Infrastructure provisioning results
        const infrastructureResult = {
            route53: null as any,
            vercel: null as any,
            success: false,
            errors: [] as string[]
        };

        // Get your domain from environment
        const baseDomain = Deno.env.get('BASE_DOMAIN') || 'yourdomain.com';
        const fullDomain = `${subdomain}.${baseDomain}`;

        try {
            // Create Route53 DNS record
            console.log('Creating Route53 DNS record for:', fullDomain);
            const route53Result = await createRoute53Record(subdomain, fullDomain);
            infrastructureResult.route53 = route53Result;
            console.log('Route53 record created successfully');
        } catch (error) {
            console.error('Route53 creation failed:', error);
            infrastructureResult.errors.push(`Route53: ${error.message}`);
        }

        try {
            // Create Vercel project
            console.log('Creating Vercel project...');
            const vercelResult = await createVercelProject(name, subdomain, fullDomain);
            infrastructureResult.vercel = vercelResult;
            console.log('Vercel project created successfully');
        } catch (error) {
            console.error('Vercel creation failed:', error);
            infrastructureResult.errors.push(`Vercel: ${error.message}`);
        }

        // Update organization with infrastructure results
        const updateData: any = {
            updated_at: new Date().toISOString()
        };

        if (infrastructureResult.route53) {
            updateData.route53_hosted_zone_id = infrastructureResult.route53.hostedZoneId;
            updateData.domain = fullDomain;
        }

        if (infrastructureResult.vercel) {
            updateData.vercel_project_id = infrastructureResult.vercel.projectId;
            updateData.vercel_deployment_url = infrastructureResult.vercel.deploymentUrl;
        }

        // Set final status
        if (infrastructureResult.route53 && infrastructureResult.vercel) {
            updateData.status = 'active';
            infrastructureResult.success = true;
        } else {
            updateData.status = 'inactive';
        }

        const { data: updatedOrg, error: updateError } = await supabase
            .from('organizations')
            .update(updateData)
            .eq('id', organization.id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating organization:', updateError);
        }

        // Log audit trail (commented out - create audit_log table if needed)
        // try {
        //     await supabase.from('audit_log').insert({
        //         user_id: user.id,
        //         action: 'CREATE_ORGANIZATION',
        //         table_name: 'organizations',
        //         record_id: organization.id,
        //         new_values: updatedOrg || organization
        //     });
        // } catch (auditError) {
        //     console.warn('Audit logging failed:', auditError);
        // }

        return new Response(
            JSON.stringify({
                success: true,
                organization: updatedOrg || organization,
                infrastructure: {
                    success: infrastructureResult.success,
                    route53: infrastructureResult.route53 ? 'created' : 'failed',
                    vercel: infrastructureResult.vercel ? 'created' : 'failed',
                    domain: fullDomain,
                    deploymentUrl: infrastructureResult.vercel?.deploymentUrl,
                    errors: infrastructureResult.errors
                }
            }),
            {
                status: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (error) {
        console.error('Unexpected error:', error);
        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                details: error.message
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});

// Production Route53 implementation with proper AWS Signature V4
async function createRoute53Record(subdomain: string, fullDomain: string) {
    const credentials: AWSCredentials = {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
        region: Deno.env.get('AWS_REGION') || 'us-east-1',
        hostedZoneId: Deno.env.get('AWS_HOSTED_ZONE_ID')!
    };

    if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.hostedZoneId) {
        throw new Error('Missing AWS credentials or hosted zone ID');
    }

    console.log(`Creating DNS record for: ${fullDomain} in hosted zone: ${credentials.hostedZoneId}`);

    // Check if record already exists
    await checkExistingRecord(fullDomain, credentials);

    const changeBatch = `<?xml version="1.0" encoding="UTF-8"?>
    <ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
        <ChangeBatch>
            <Changes>
                <Change>
                    <Action>CREATE</Action>
                    <ResourceRecordSet>
                        <Name>${fullDomain}</Name>
                        <Type>CNAME</Type>
                        <TTL>300</TTL>
                        <ResourceRecords>
                            <ResourceRecord>
                                <Value>cname.vercel-dns.com</Value>
                            </ResourceRecord>
                        </ResourceRecords>
                    </ResourceRecordSet>
                </Change>
            </Changes>
        </ChangeBatch>
    </ChangeResourceRecordSetsRequest>`;

    const path = `/2013-04-01/hostedzone/${credentials.hostedZoneId}/rrset`;

    console.log('Route53 request body:', changeBatch);

    const response = await makeAWSRequest('POST', path, changeBatch, credentials);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Route53 error response:', errorText);
        throw new Error(`Route53 API error: ${response.status} - ${errorText}`);
    }

    const xmlText = await response.text();
    console.log('Route53 success response:', xmlText);

    const result = parseRoute53Response(xmlText);
    console.log('Parsed Route53 result:', result);

    // Wait for change to propagate
    if (result.ChangeInfo?.Id) {
        console.log(`Waiting for Route53 change ${result.ChangeInfo.Id} to propagate...`);
        await waitForRoute53Change(result.ChangeInfo.Id, credentials);
    }

    // Verify the record was created
    await verifyRecordCreated(fullDomain, credentials);

    return {
        hostedZoneId: credentials.hostedZoneId,
        changeId: result.ChangeInfo?.Id,
        domain: fullDomain,
        status: 'INSYNC'
    };
}

// Check if DNS record already exists
async function checkExistingRecord(domain: string, credentials: AWSCredentials) {
    console.log(`Checking if DNS record already exists for: ${domain}`);

    const path = `/2013-04-01/hostedzone/${credentials.hostedZoneId}/rrset?name=${encodeURIComponent(domain)}&type=CNAME`;

    const response = await makeAWSRequest('GET', path, '', credentials);

    if (response.ok) {
        const xmlText = await response.text();
        console.log('Existing records check response:', xmlText);

        const data = parseRoute53Response(xmlText);
        const exists = data.ResourceRecordSets?.some((rrs: any) =>
            rrs.Name === domain && rrs.Type === 'CNAME'
        );

        if (exists) {
            throw new Error(`DNS record for ${domain} already exists`);
        }

        console.log(`No existing CNAME record found for ${domain}`);
    } else {
        console.warn('Failed to check existing records:', await response.text());
    }
}

// Verify the record was actually created
async function verifyRecordCreated(domain: string, credentials: AWSCredentials) {
    console.log(`Verifying DNS record was created for: ${domain}`);

    const path = `/2013-04-01/hostedzone/${credentials.hostedZoneId}/rrset?name=${encodeURIComponent(domain)}&type=CNAME`;

    try {
        const response = await makeAWSRequest('GET', path, '', credentials);

        if (response.ok) {
            const xmlText = await response.text();
            console.log('Verification response:', xmlText);

            const data = parseRoute53Response(xmlText);
            const recordExists = data.ResourceRecordSets?.some((rrs: any) =>
                rrs.Name === domain && rrs.Type === 'CNAME'
            );

            if (recordExists) {
                console.log(`✅ DNS record verified: ${domain} CNAME record exists`);
            } else {
                console.warn(`⚠️ DNS record not found after creation: ${domain}`);
            }
        } else {
            console.warn('Failed to verify record:', await response.text());
        }
    } catch (error) {
        console.warn('Record verification failed:', error);
    }
}

// Parse Route53 XML response
function parseRoute53Response(xmlText: string): any {
    try {
        // Extract ChangeInfo
        const changeIdMatch = xmlText.match(/<Id>([^<]+)<\/Id>/);
        const statusMatch = xmlText.match(/<Status>([^<]+)<\/Status>/);

        if (changeIdMatch && statusMatch) {
            return {
                ChangeInfo: {
                    Id: changeIdMatch[1],
                    Status: statusMatch[1]
                }
            };
        }

        // Extract ResourceRecordSets
        const nameMatches = xmlText.match(/<Name>([^<]+)<\/Name>/g) || [];
        const typeMatches = xmlText.match(/<Type>([^<]+)<\/Type>/g) || [];

        if (nameMatches.length > 0) {
            const ResourceRecordSets = nameMatches.map((nameMatch, index) => ({
                Name: nameMatch.replace(/<\/?Name>/g, ''),
                Type: typeMatches[index]?.replace(/<\/?Type>/g, '') || ''
            }));

            return { ResourceRecordSets };
        }

        return {};
    } catch (error) {
        console.warn('Failed to parse Route53 XML:', error);
        console.log('Raw XML:', xmlText);
        return {};
    }
}

// Wait for Route53 change to propagate
async function waitForRoute53Change(changeId: string, credentials: AWSCredentials, maxAttempts = 30) {
    const cleanChangeId = changeId.replace('/change/', '');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const path = `/2013-04-01/change/${cleanChangeId}`;

        try {
            const response = await makeAWSRequest('GET', path, '', credentials);

            if (response.ok) {
                const xmlText = await response.text();
                const data = parseRoute53Response(xmlText);
                if (data.ChangeInfo?.Status === 'INSYNC') {
                    console.log('Route53 change propagated successfully');
                    return;
                }
            }
        } catch (error) {
            console.warn(`Change status check attempt ${attempt + 1} failed:`, error.message);
        }

        // Wait 10 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    console.warn('Route53 change status check timed out, but deployment may still succeed');
}

// Production Vercel implementation with GitHub integration
async function createVercelProject(name: string, subdomain: string, domain: string) {
    const vercelToken = Deno.env.get('VERCEL_TOKEN');
    const githubRepo = Deno.env.get('GITHUB_REPO'); // e.g., 'your-username/your-repo'
    const githubToken = Deno.env.get('GITHUB_TOKEN'); // Optional: for private repos
    const vercelTeamId = Deno.env.get('VERCEL_TEAM_ID'); // Optional: for team projects

    if (!vercelToken) {
        throw new Error('Missing Vercel token');
    }

    if (!githubRepo) {
        throw new Error('Missing GitHub repository configuration');
    }

    const projectName = `${subdomain}-app`;

    // Check if project already exists
    const existingProject = await checkExistingVercelProject(projectName, vercelToken, vercelTeamId);
    if (existingProject) {
        throw new Error(`Vercel project ${projectName} already exists`);
    }

    // Create project payload with GitHub integration
    const projectPayload: any = {
        name: projectName,
        framework: null, // for static sites, set to null
        rootDirectory: 'web', // Your web/ directory
        gitRepository: {
            type: 'github',
            repo: githubRepo
        },
        enableAffectedProjectsDeployments: true,
        installCommand: "npm ci",
        buildCommand: "npx expo export",
        outputDirectory: "dist",
        environmentVariables: [
            {
                key: 'ORGANIZATION_SUBDOMAIN',
                value: subdomain,
                type: 'encrypted',
                target: ['production', 'preview', 'development']
            },
            {
                key: 'NEXT_PUBLIC_ORGANIZATION_NAME',
                value: name,
                type: 'plain',
                target: ['production', 'preview', 'development']
            },
            {
                key: 'NEXT_PUBLIC_DOMAIN',
                value: domain,
                type: 'plain',
                target: ['production', 'preview', 'development']
            },
            {
                key: 'NEXT_PUBLIC_ORGANIZATION_SUBDOMAIN',
                value: subdomain,
                type: 'plain',
                target: ['production', 'preview', 'development']
            },
            {
                key: 'EXPO_PUBLIC_SUPABASE_URL',
                value: Deno.env.get('SUPABASE_URL') || '',
                type: 'plain',
                target: ['production', 'preview', 'development']
            },
            {
                key: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
                value: Deno.env.get('SUPABASE_ANON_KEY') || '',
                type: 'plain',
                target: ['production', 'preview', 'development']
            }
        ]
    };

    // Add GitHub token if provided (for private repos)
    if (githubToken) {
        projectPayload.gitRepository.repoId = await getGitHubRepoId(githubRepo, githubToken);
    }

    // Build URL with team ID if provided
    let createUrl = 'https://api.vercel.com/v10/projects';
    if (vercelTeamId) {
        createUrl += `?teamId=${vercelTeamId}`;
    }

    console.log(`Creating Vercel project: ${projectName}${vercelTeamId ? ` under team: ${vercelTeamId}` : ''}`);

    // Create project
    const projectResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${vercelToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(projectPayload)
    });

    if (!projectResponse.ok) {
        const errorData = await projectResponse.text();
        throw new Error(`Vercel project creation failed: ${projectResponse.status} - ${errorData}`);
    }

    const projectData = await projectResponse.json();

    // Add custom domain
    await addVercelDomain(projectData.id, domain, vercelToken, vercelTeamId);

    // Trigger initial deployment from GitHub
    const deploymentResult = await triggerVercelDeployment(projectName, projectData.id, vercelToken, vercelTeamId);

    return {
        projectId: projectData.id,
        projectName,
        domain,
        vercelUrl: `https://${projectName}.vercel.app`,
        deploymentUrl: deploymentResult?.url || `https://${projectName}.vercel.app`,
        githubRepo
    };
}

// Get GitHub repository ID (needed for private repos)
async function getGitHubRepoId(repo: string, token: string): Promise<number | undefined> {
    try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data.id;
        }
    } catch (error) {
        console.warn('Failed to get GitHub repo ID:', error);
    }

    return undefined;
}

// Check if Vercel project exists
async function checkExistingVercelProject(projectName: string, token: string, teamId?: string) {
    try {
        let url = `https://api.vercel.com/v9/projects/${projectName}`;
        if (teamId) {
            url += `?teamId=${teamId}`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.ok;
    } catch {
        return false;
    }
}

// Add domain to Vercel project
async function addVercelDomain(projectId: string, domain: string, token: string, teamId?: string) {
    let url = `https://api.vercel.com/v9/projects/${projectId}/domains`;
    if (teamId) {
        url += `?teamId=${teamId}`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: domain })
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.warn(`Failed to add domain ${domain}:`, errorData);
        // Don't throw error - domain addition can be retried later
    } else {
        console.log(`Successfully added domain ${domain} to project`);
    }
}

// Trigger Vercel deployment from GitHub
async function triggerVercelDeployment(projectName: string, projectId: string, token: string, teamId?: string) {
    try {
        // Option 1: Get project details to see if it's already connected to Git
        let getProjectUrl = `https://api.vercel.com/v9/projects/${projectId}`;
        if (teamId) {
            getProjectUrl += `?teamId=${teamId}`;
        }

        const projectResponse = await fetch(getProjectUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (projectResponse.ok) {
            const projectData = await projectResponse.json();
            console.log('Project details:', projectData);

            // If project has Git repository connected, it should auto-deploy
            // if (projectData.link?.type === 'github') {
            //     console.log('Project is connected to GitHub, auto-deployment should occur');
            //     return {
            //         url: `https://${projectId}.vercel.app`,
            //         id: 'auto-deploy',
            //         status: 'auto-deploying'
            //     };
            // }
        }

        // Option 2: Try to get existing deployments to see deployment status
        let getDeploymentsUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`;
        if (teamId) {
            getDeploymentsUrl += `&teamId=${teamId}`;
        }

        const deploymentsResponse = await fetch(getDeploymentsUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (deploymentsResponse.ok) {
            const deploymentsData = await deploymentsResponse.json();
            const latestDeployment = deploymentsData.deployments[0];

            if (latestDeployment) {
                console.log('Found existing deployment:', latestDeployment.url);
                return {
                    url: latestDeployment.url,
                    id: latestDeployment.uid,
                    status: latestDeployment.state
                };
            }
        }

        // Option 3: Create a simple hook-based deployment trigger
        // This approach uses Vercel's deploy hooks if available
        console.log('Attempting to trigger deployment via project hook...');

        // Get the GitHub repo info from environment
        const githubRepo = Deno.env.get('GITHUB_REPO');
        const githubToken = Deno.env.get('GITHUB_TOKEN');

        if (githubRepo && githubToken) {
            const repoId = await getGitHubRepoId(githubRepo, githubToken);

            if (repoId) {
                // Try deployment with proper repoId
                let createDeploymentUrl = 'https://api.vercel.com/v13/deployments';
                if (teamId) {
                    createDeploymentUrl += `?teamId=${teamId}`;
                }
                if (projectId) {
                    createDeploymentUrl += `&projectId=${projectId}`;
                }

                const deploymentPayload = {
                    name: projectName,
                    target: 'production',
                    gitSource: {
                        type: 'github',
                        repoId: repoId,
                        ref: 'master' // or 'master' depending on your default branch
                    }
                };

                const response = await fetch(createDeploymentUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(deploymentPayload)
                });

                if (response.ok) {
                    const deploymentData = await response.json();
                    console.log('Git deployment with repoId triggered successfully:', deploymentData.url);
                    return deploymentData;
                } else {
                    const errorData = await response.text();
                    console.log('Git deployment with repoId failed:', errorData);
                }
            }
        }

        // Fallback: Return expected URL format
        console.log('All deployment triggers failed, but project should auto-deploy from Git connection');
        return {
            url: `https://${projectId}.vercel.app`,
            id: 'auto-deploy',
            status: 'building'
        };

    } catch (error) {
        console.warn('Deployment trigger failed, but project should auto-deploy from Git:', error);

        // Return expected URL format even if deployment trigger fails
        return {
            url: `https://${projectId}.vercel.app`,
            id: 'auto-deploy',
            status: 'building'
        };
    }
}

// AWS Signature Version 4 implementation (FIXED)
async function makeAWSRequest(method: string, path: string, body: string, credentials: AWSCredentials) {
    const service = 'route53';
    const host = 'route53.amazonaws.com';
    const url = `https://${host}${path}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    // Parse query string from path
    const [canonicalUri, queryString] = path.includes('?') ? path.split('?') : [path, ''];

    // Create canonical query string (sorted)
    const canonicalQueryString = queryString ?
        queryString.split('&').sort().join('&') : '';

    // Create canonical headers (must be lowercase and sorted)
    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';
    const payloadHash = await sha256(body || '');

    const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${credentials.region}/${service}/aws4_request`;
    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        await sha256(canonicalRequest)
    ].join('\n');

    // Calculate signature
    const signature = await getSignatureKey(
        credentials.secretAccessKey,
        dateStamp,
        credentials.region,
        service,
        stringToSign
    );

    // Create authorization header
    const authorization = `${algorithm} Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    console.log('AWS Request Debug:', {
        method,
        canonicalUri,
        canonicalQueryString,
        amzDate,
        payloadHash,
        canonicalRequest: canonicalRequest.replace(/\n/g, '\\n')
    });

    return fetch(url, {
        method,
        headers: {
            'Host': host,
            'X-Amz-Date': amzDate,
            'Authorization': authorization,
            'Content-Type': 'text/xml'
        },
        body: body || undefined
    });
}

// AWS signature calculation helpers
async function sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const keyObj = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', keyObj, encoder.encode(message));
    return new Uint8Array(signature);
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string, stringToSign: string): Promise<string> {
    const encoder = new TextEncoder();

    // Step 1: Create signing key
    const kDate = await hmacSha256(encoder.encode('AWS4' + key), dateStamp);
    const kRegion = await hmacSha256(kDate, regionName);
    const kService = await hmacSha256(kRegion, serviceName);
    const kSigning = await hmacSha256(kService, 'aws4_request');

    // Step 2: Create signature
    const signature = await hmacSha256(kSigning, stringToSign);

    return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
}