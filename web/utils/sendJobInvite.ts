import { supabase } from '../lib/supabase';

// HT-1: send (or resend) the calendar invitation for a job on demand.
//
// The same upsert-calendar-event function that the jobs webhook calls also
// accepts a signed-in user's request `{ action: 'send', jobId }`. It emails
// the .ics to the client, the job's creator and the person pressing the
// button, and returns the addresses it sent to.
export async function sendJobInvite(jobId: number): Promise<{ to: string[] }> {
  // The function refuses anything but a live user session. supabase-js falls
  // back to the public anon key when there is no session, which the function
  // rejects with "missing sub claim"; the screens can look signed in without
  // one because the database still allows anonymous reads. Check first so the
  // user gets told to sign in rather than a cryptic 401.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Your session has expired. Sign out and sign in again, then retry.');
  }

  const { data, error } = await supabase.functions.invoke('upsert-calendar-event', {
    body: { action: 'send', jobId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    // On a non-2xx supabase-js only says "Edge Function returned a non-2xx
    // status code"; the function's { error } or { skipped } body is on
    // error.context. Surface it so the user sees the real reason.
    let reason = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) reason = body.error;
      else if (body?.skipped) reason = body.skipped;
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new Error(reason);
  }

  if (data?.skipped) {
    throw new Error(data.skipped);
  }

  return { to: Array.isArray(data?.to) ? data.to : [] };
}
