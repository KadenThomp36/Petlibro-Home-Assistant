import { describe, expect, it } from 'vitest';
import { parseDeviceOverviewSnapshot } from './device-overview';

describe('parseDeviceOverviewSnapshot', () => {
  it('accepts the versioned overview envelope', () => {
    const value = {
      apiVersion: 'v1',
      generatedAt: '2026-10-14T12:00:00Z',
      services: [],
      devices: [],
      warnings: [],
    };
    expect(parseDeviceOverviewSnapshot(value)).toEqual(value);
  });

  it('rejects incomplete envelopes', () => {
    expect(() => parseDeviceOverviewSnapshot({ apiVersion: 'v1' })).toThrow(
      'invalid device overview',
    );
  });

  it('rejects malformed nested observations', () => {
    expect(() =>
      parseDeviceOverviewSnapshot({
        apiVersion: 'v1',
        generatedAt: '2026-10-14T12:00:00Z',
        services: [{ id: 'appdaemon', availability: 'invented' }],
        devices: [],
        warnings: [],
      }),
    ).toThrow('invalid device overview');
  });
});
