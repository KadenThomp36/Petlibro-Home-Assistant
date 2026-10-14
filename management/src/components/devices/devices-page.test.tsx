import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevicesPage } from './devices-page';

afterEach(() => vi.unstubAllGlobals());

describe('DevicesPage', () => {
  it('renders verified controller state and camera provenance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(snapshot)),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <DevicesPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('PLAF203 · SERIAL1')).toBeInTheDocument();
    expect(screen.getByText('Verified reads healthy')).toBeInTheDocument();
    expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
    expect(screen.getByText('appdaemon-controller')).toBeInTheDocument();
    expect(screen.getByText('go2rtc-runtime')).toBeInTheDocument();
  });
});

const observedAt = '2026-10-14T12:00:00.000Z';
const metadata = (source: string, authority: string, verification: string) => ({
  source,
  authority,
  verification,
  collectedAt: observedAt,
  observedAt,
  freshness: 'fresh',
  scope: `${source} observation scope.`,
});
const snapshot = {
  apiVersion: 'v1',
  generatedAt: observedAt,
  warnings: [],
  services: [],
  devices: [
    {
      id: 'PLAF203/SERIAL1',
      product: 'PLAF203',
      serial: 'SERIAL1',
      uidDisplay: 'ABCD••••5678',
      ipAddress: '192.0.2.10',
      configured: false,
      availability: 'ready',
      lastMqttSeen: observedAt,
      streamName: 'petlibro_plaf203_serial1',
      readiness: { mqtt_discovered: true },
      warnings: [],
      observation: metadata(
        'appdaemon-registry',
        'appdaemon',
        'service-reported',
      ),
      controller: {
        availability: 'ready',
        reconciliationState: 'READY',
        feederMqttConnected: true,
        stateAgentHealthy: true,
        writesReady: true,
        writePending: false,
        lastFeederActivityAt: observedAt,
        lastHomeAssistantBirthAt: observedAt,
        verifiedState: {
          verifiedAt: observedAt,
          revisions: { core_rev: 'core-1' },
          planCount: 2,
          queuePending: false,
          settings: {},
        },
        observation: metadata(
          'appdaemon-controller',
          'appdaemon',
          'state-agent-verified',
        ),
      },
      camera: {
        availability: 'ready',
        configured: true,
        streamName: 'petlibro_plaf203_serial1',
        status: 'online',
        requestedQuality: 'hd',
        resolution: { width: 1920, height: 1080 },
        health: { dropped_frames: 0 },
        observation: metadata('go2rtc-runtime', 'go2rtc', 'service-reported'),
      },
    },
  ],
};
