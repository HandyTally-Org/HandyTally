// HT-38: which tenant is this browser on?
//
// Every customer gets a first-level subdomain of the base domain
// (wgelectric.handytally.com) and all of them serve the same bundle (HT-37).
// The subdomain therefore has to be read from the address bar. This module
// only parses; the lookup against `organizations` lives in AuthContext so
// that lib/supabase.ts can import from here without a cycle.

export const BASE_DOMAIN = (process.env.EXPO_PUBLIC_BASE_DOMAIN || 'handytally.com')
  .trim()
  .toLowerCase();

/**
 * The tenant subdomain for a hostname, or null when the host carries no
 * tenant: the apex, `www`, localhost / loopback, the Worker's `*.workers.dev`
 * URL, a hostname outside the base domain, and anything deeper than one
 * level (only first-level subdomains are routed, HT-37).
 */
export function parseTenantSubdomain(
  hostname: string | null | undefined,
  baseDomain: string = BASE_DOMAIN,
): string | null {
  if (!hostname) return null;
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  if (host === 'localhost' || host.endsWith('.localhost')) return null;
  if (host === '127.0.0.1' || host === '[::1]') return null;
  if (host.endsWith('.workers.dev')) return null;

  const base = baseDomain.trim().toLowerCase();
  if (host === base) return null;
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;

  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.')) return null;
  if (label === 'www') return null;
  return label;
}

/**
 * True for the bare product domain (handytally.com, www.handytally.com). The
 * app is not served there: customers use their own subdomain and the apex is
 * the sales page (HT-43). localhost and workers.dev are not the apex.
 */
export function isApexHost(hostname: string | null | undefined, baseDomain: string = BASE_DOMAIN): boolean {
  if (!hostname) return false;
  const host = hostname.trim().toLowerCase().replace(/.$/, '');
  const base = baseDomain.trim().toLowerCase();
  return host === base || host === `www.${base}`;
}

/** window.location.hostname in a browser; null during static rendering and on native. */
export function currentHostname(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return window.location.hostname || null;
}

/**
 * Resolved once at module load. It is a constant for the life of the page:
 * the hostname cannot change without a full navigation, and lib/supabase.ts
 * needs it synchronously to attach the x-tenant-subdomain request header.
 */
export const tenantSubdomain: string | null = parseTenantSubdomain(currentHostname());

/** True when this page is the product apex rather than a customer host. */
export const apexHost: boolean = isApexHost(currentHostname());
