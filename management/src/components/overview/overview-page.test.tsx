import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverviewPage } from './overview-page';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const snapshot = {
  apiVersion: 'v1',
  generatedAt: '2026-10-13T12:00:00.000Z',
  management: {
    name: 'Petlibro Management',
    version: '0.1.0-test',
    state: 'ready',
    detail: 'The browser application and TypeScript API are available.',
    observation: {
      source: 'management-server',
      authority: 'management-application',
      observedAt: '2026-10-13T12:00:00.000Z',
      scope: 'This process only; it does not imply feeder or runtime health.',
    },
  },
  integrations: [
    {
      id: 'python-worker',
      name: 'Device operations worker',
      availability: 'not-configured',
      detail: 'Worker IPC is not connected.',
      observation: {
        source: 'management-configuration',
        authority: 'management-application',
        observedAt: '2026-10-13T12:00:00.000Z',
        scope:
          'Adapter availability only; no external service state was observed.',
      },
    },
  ],
} as const;

const deviceSnapshot = {
  apiVersion: 'v1',
  generatedAt: '2026-10-13T12:00:00.000Z',
  devices: [],
  warnings: [],
  services: [
    {
      id: 'mosquitto',
      name: 'MQTT broker',
      availability: 'unavailable',
      detail: 'The configured broker could not be reached.',
      observation: {
        source: 'mqtt-broker',
        authority: 'mosquitto',
        collectedAt: '2026-10-13T12:00:00.000Z',
        observedAt: '2026-10-13T12:00:00.000Z',
        freshness: 'fresh',
        verification: 'reachable',
        scope: 'Bounded MQTT connection probe.',
      },
    },
  ],
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OverviewPage', () => {
  it('renders management readiness without inventing integration health', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        return Promise.resolve(
          Response.json(
            url.includes('/operations')
              ? { operations: [] }
              : url.includes('/devices/overview')
                ? deviceSnapshot
                : snapshot,
          ),
        );
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OverviewPage />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Overview',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('0.1.0-test')).toBeInTheDocument();
    expect(screen.getByText('MQTT broker')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/feeder is healthy/i)).not.toBeInTheDocument();
  });
});
