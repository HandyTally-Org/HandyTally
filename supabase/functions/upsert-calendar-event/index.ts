// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Nylas from 'nylas'
import {serve} from "https://deno.land/std@0.168.0/http/server.ts"
import {createClient} from 'supabase-js'

const NylasConfig = {
    apiKey: Deno.env.get('NYLAS_API_KEY') as string,
    apiUri: Deno.env.get('NYLAS_API_URI') as string,
}

const nylas = new Nylas(NylasConfig);
const NYLAS_GRANT_ID = Deno.env.get('NYLAS_GRANT_ID') as string;
const NYLAS_CALENDAR_ID = Deno.env.get('NYLAS_CALENDAR_ID') as string;

// standard corsHeaders
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
}

// this edge function is triggered via database webhooks on the jobs table

serve(async (req) => {
    try {
        // Check if the request method is OPTIONS (CORS preflight)
        if (req.method === 'OPTIONS') {
            return new Response('ok', {headers: corsHeaders});
        }

        // Check if the request method is POST
        if (req.method !== 'POST') {
            return new Response('Method Not Allowed', {status: 405});
        }

        // Check if the request has a valid authorization header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response('Unauthorized', {status: 401});
        }

        // Check if the request has a valid content type
        const contentType = req.headers.get('Content-Type');
        if (!contentType || contentType !== 'application/json') {
            return new Response('Unsupported Media Type', {status: 415});
        }

        const { type, table, record, old_record } = await req.json();

        console.log('Database event:', { type, table, record });
        console.log("client_id", record.client_id)
        console.log("start_date", record.start_date)
        console.log("end_date", record.end_date)

        // this edge function is triggered via database webhooks on the jobs table
        if (type === 'INSERT' && table === 'jobs') {
            // Handle job insert
            console.log('Job created uid:', record.uid)
            console.log('Job client uid:', record.client_id);

            // fetch client for client.email and client.address using supabase client
            const supabase = createClient(Deno.env.get('SUPABASE_URL') as string, Deno.env.get('SUPABASE_ANON_KEY') as string)
            const {data, error} = await supabase.from('clients').select().eq('uid', record.client_id);

            if (error || !data) {
                console.error("Error fetching client data: ", error);
                return new Response('Error fetching client data:' + error.message, {status: 400})
            }

            const client = data[0];

            console.log('Client info:', client)

            // return 401 on missing client email
            if (!client.email) {
                return new Response('client.email missing to send calendar event', {status: 400})
            }
            // return 401 on missing start_date
            if (!record.start_date) {
                return new Response('start_date missing to send calendar event', {status: 400})
            }
            // return 401 on missing end date
            if (!record.end_date) {
                return new Response('end_date missing to send calendar event', {status: 400})
            }

            // send update using /functions/send-calendar-invite
            try {
                console.log('Creating event with Nylas API...');

                const event = await nylas.events.create({
                    identifier: NYLAS_GRANT_ID as string,
                    requestBody: {
                        title: record.title || "Job Title [TBD]",
                        when: {
                            startTime: Math.floor(new Date(record.start_date).getTime() / 1000),
                            endTime: Math.floor(new Date(record.end_date).getTime() / 1000),
                        },
                        description: record.description || "Job Description [PENDING]",
                        location: client.address || '',
                        participants: [
                            {
                                email: client.email,
                                status: "noreply",
                            }],

                    },
                    queryParams: {
                        calendarId: NYLAS_CALENDAR_ID as string,

                    },
                })

                console.log('Event:', event);
                return new Response(JSON.stringify(event.data), {headers: {'Content-Type': 'application/json'}});
            } catch (error) {
                console.error('Error sending calendar invite:', error)
                return new Response(JSON.stringify({ success: false, error: 'Failed to send calendar invite' + (error as any).message }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 500,
                })
            }
        }
        if (type === 'UPDATE' && table === 'jobs') {
            // Handle job update
            console.log('Job updated uid:', record.uid);
            const {startdate: old_startdate, enddate: old_enddate} = old_record;
            const {startdate: startdate, enddate: enddate} = record
            // TODO - fetch and update calendar event
            // ...
        }
        if (type === 'DELETE' && table === 'jobs') {
            // Handle job update
            console.log('Job deleted uid:', record.uid);
            // TODO - fetch and delete calendar event
            // ...
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error('Error processing request:', error);
        return new Response('Internal Server Error: ' + (error as any).message, {status: 500});
    }

})


