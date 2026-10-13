import { describe, expect, it } from 'vitest';
import { parseSystemStatusSnapshot } from './system-status';

const validSnapshot = {
  apiVersion: 'v1',
  generatedAt: '2026-10-13T12:00:00.000Z',
  management: {
    name: 'Petlibro Management',
    version: '0.1.0-test',
    state: 'ready',
    detail: 'Ready.',
    observation: {
      source: 'management-server',
      authority: 'management-application',
      observedAt: '2026-10-13T12:00:00.000Z',
      scope: 'Management process.',
    },
  },
  integrations: [],
};

describe('parseSystemStatusSnapshot', () => {
  it('accepts the versioned status contract', () => {
    expect(parseSystemStatusSnapshot(validSnapshot)).toEqual(validSnapshot);
  });

  it('rejects unsupported or incomplete status responses', () => {
    expect(() =>
      parseSystemStatusSnapshot({ ...validSnapshot, apiVersion: 'v2' }),
    ).toThrow('unsupported response');
    expect(() =>
      parseSystemStatusSnapshot({ ...validSnapshot, management: null }),
    ).toThrow('invalid status snapshot');
  });
});
