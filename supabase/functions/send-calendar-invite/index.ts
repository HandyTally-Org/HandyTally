import { serve } from "https://deno.fresh.dev/std@v9.6.2/http/server.ts";
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { job } = await req.json();

    // Format the event details
    const startDateTime = new Date(`${job.start_date} ${job.start_time}`);
    const endDateTime = new Date(`${job.end_date} ${job.end_time}`);

    // Create ICS content
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `DTSTART:${startDateTime.toISOString().replace(/[-:]/g, '')}`,
      `DTEND:${endDateTime.toISOString().replace(/[-:]/g, '')}`,
      `SUMMARY:${job.title}`,
      `DESCRIPTION:${job.description || ''}\\nClient: ${job.client?.name || 'Unknown'}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\n');

    // Send email using Supabase's email service
    const { error } = await supabase.auth.admin.createUser({
      email: process.env.COMPANY_EMAIL,
      email_confirm: true,
      app_metadata: {
        provider: 'email',
      },
      user_metadata: {
        calendar_event: {
          ics: Buffer.from(icsContent).toString('base64'),
          title: job.title,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
        },
      },
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ message: 'Calendar invite sent successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
}); 