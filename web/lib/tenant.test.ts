import { parseTenantSubdomain } from './tenant';

const base = 'handytally.com';

describe('parseTenantSubdomain', () => {
  it('returns the first-level subdomain of the base domain', () => {
    expect(parseTenantSubdomain('wgelectric.handytally.com', base)).toBe('wgelectric');
    expect(parseTenantSubdomain('demo.handytally.com', base)).toBe('demo');
  });

  it('normalises case, whitespace and a trailing dot', () => {
    expect(parseTenantSubdomain(' WGElectric.HandyTally.com. ', base)).toBe('wgelectric');
    expect(parseTenantSubdomain('demo.handytally.com', 'HandyTally.COM')).toBe('demo');
  });

  it('treats the apex and www as no tenant', () => {
    expect(parseTenantSubdomain('handytally.com', base)).toBeNull();
    expect(parseTenantSubdomain('www.handytally.com', base)).toBeNull();
  });

  it('treats local development hosts as no tenant', () => {
    expect(parseTenantSubdomain('localhost', base)).toBeNull();
    expect(parseTenantSubdomain('wgelectric.localhost', base)).toBeNull();
    expect(parseTenantSubdomain('127.0.0.1', base)).toBeNull();
    expect(parseTenantSubdomain('[::1]', base)).toBeNull();
  });

  it('treats the workers.dev preview URL as no tenant', () => {
    expect(parseTenantSubdomain('handytally-web.lucas-r-fittipaldi.workers.dev', base)).toBeNull();
  });

  it('ignores hosts outside the base domain and deeper subdomains', () => {
    expect(parseTenantSubdomain('wgelectricus.com', base)).toBeNull();
    expect(parseTenantSubdomain('evilhandytally.com', base)).toBeNull();
    expect(parseTenantSubdomain('a.b.handytally.com', base)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseTenantSubdomain('', base)).toBeNull();
    expect(parseTenantSubdomain(null, base)).toBeNull();
    expect(parseTenantSubdomain(undefined, base)).toBeNull();
  });
});

import { isApexHost } from './tenant';

describe('isApexHost', () => {
  it('is true for the bare domain and www', () => {
    expect(isApexHost('handytally.com', base)).toBe(true);
    expect(isApexHost('WWW.HandyTally.com.', base)).toBe(true);
  });

  it('is false for customer hosts, localhost and the workers.dev URL', () => {
    expect(isApexHost('wgelectricus.handytally.com', base)).toBe(false);
    expect(isApexHost('localhost', base)).toBe(false);
    expect(isApexHost('handytally-web.lucas-r-fittipaldi.workers.dev', base)).toBe(false);
    expect(isApexHost(null, base)).toBe(false);
  });
});

import { releaseChannel, releaseChannelLabel } from './tenant';

describe('releaseChannel', () => {
  it('names the demo and prod hosts', () => {
    expect(releaseChannel('demo.handytally.com', base)).toBe('demo');
    expect(releaseChannel('PROD.handytally.com.', base)).toBe('prod');
  });

  it('treats every other tenant subdomain as a customer host', () => {
    expect(releaseChannel('wgelectricus.handytally.com', base)).toBe('customer');
    expect(releaseChannel('acme.handytally.com', base)).toBe('customer');
  });

  it('has no channel on the apex, www, localhost and workers.dev', () => {
    expect(releaseChannel('handytally.com', base)).toBe('none');
    expect(releaseChannel('www.handytally.com', base)).toBe('none');
    expect(releaseChannel('localhost', base)).toBe('none');
    expect(releaseChannel('handytally-web.lucas-r-fittipaldi.workers.dev', base)).toBe('none');
    expect(releaseChannel(null, base)).toBe('none');
  });
});

describe('releaseChannelLabel', () => {
  it('is the channel for demo and prod and the subdomain for a customer', () => {
    expect(releaseChannelLabel('demo.handytally.com', base)).toBe('demo');
    expect(releaseChannelLabel('prod.handytally.com', base)).toBe('prod');
    expect(releaseChannelLabel('wgelectricus.handytally.com', base)).toBe('wgelectricus');
  });

  it('is null where there is no channel', () => {
    expect(releaseChannelLabel('handytally.com', base)).toBeNull();
    expect(releaseChannelLabel('localhost', base)).toBeNull();
  });
});
