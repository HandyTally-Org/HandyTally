import { supabase } from '../lib/supabase';

// HT-88: the one way to read the organisation's company row (Admin > Company
// > Info) for an invoice, estimate, the sidebar logo or the editor itself.
//
// Every reader used to run `from('company').select('*').single()` with no
// organisation filter. `.single()` errors on zero rows and on two or more, and
// the callers swallowed that error and fell back to placeholder text, so a
// superuser on localhost (who sees every organisation's row) or an
// organisation that ended up with a second row saw "Your Company" on its
// documents. This scopes the read to the organisation and takes the most
// recently updated row when there is more than one.

export type CompanyProfile = {
  uid: number;
  business_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  ein: string | null;
  logo_url: string | null;
  organization_id: string | null;
  updated_at: string | null;
};

export const COMPANY_PROFILE_COLUMNS =
  'uid, business_name, address, email, phone, ein, logo_url, organization_id, updated_at';

export async function fetchCompanyProfile(organizationId: string | null | undefined): Promise<CompanyProfile | null> {
  let query = supabase.from('company').select(COMPANY_PROFILE_COLUMNS);
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data, error } = await query
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('uid', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as CompanyProfile | null) ?? null;
}

/** The logo saved on the company row, or the newest logo attachment as a data: URL. */
export async function fetchCompanyLogoDataUrl(organizationId: string | null | undefined): Promise<string | null> {
  let query = supabase
    .from('company_attachments')
    .select('file_data, file_type')
    .eq('is_logo', true);
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.file_data) return null;
  return `data:${data.file_type || 'image/png'};base64,${data.file_data}`;
}
