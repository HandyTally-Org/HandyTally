import { formatVersionLabel, isReleaseVersion } from './release';

describe('isReleaseVersion', () => {
  it('accepts a semver tag with the v prefix', () => {
    expect(isReleaseVersion('v1.5.0')).toBe(true);
    expect(isReleaseVersion('v10.20.30')).toBe(true);
  });

  it('rejects demo and local builds and tags without the prefix', () => {
    expect(isReleaseVersion('master-3f2a1c9')).toBe(false);
    expect(isReleaseVersion('dev')).toBe(false);
    expect(isReleaseVersion('1.5.0')).toBe(false);
    expect(isReleaseVersion('v1.04')).toBe(false);
  });
});

describe('formatVersionLabel', () => {
  it('joins version and channel with a middle dot', () => {
    expect(formatVersionLabel('v1.5.0', 'prod')).toBe('v1.5.0 · prod');
    expect(formatVersionLabel('v1.5.0', 'wgelectricus')).toBe('v1.5.0 · wgelectricus');
    expect(formatVersionLabel('master-3f2a1c9', 'demo')).toBe('master-3f2a1c9 · demo');
  });

  it('shows only the version where the host has no channel', () => {
    expect(formatVersionLabel('dev', null)).toBe('dev');
    expect(formatVersionLabel('v1.5.0', undefined)).toBe('v1.5.0');
  });
});
