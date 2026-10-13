import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOperationDetail,
  fetchOperations,
  operationEventsWebSocketUrl,
} from '#/infrastructure/http/operations-client';
import { OperationsPage } from './operations-page';

const { operation } = vi.hoisted(() => ({
  operation: {
    operationId: '077fb351-30c0-4935-a962-49bf11e8d327',
    invocationId: 'bf3fa744-c49e-49bd-b7af-e4eec2f5fa86',
    workerInstanceId: 'worker-test',
    actionId: 'state-agent.inspect-health',
    capabilityId: 'state-agent.inspect-health.v1',
    target: { kind: 'state-agent', label: '192.0.2.1' },
    status: 'succeeded',
    stage: 'completed',
    createdAt: '2026-10-13T12:00:00.000Z',
    updatedAt: '2026-10-13T12:00:01.000Z',
    startedAt: '2026-10-13T12:00:00.000Z',
    completedAt: '2026-10-13T12:00:01.000Z',
    lastWorkerEventSequence: 4,
    result: {
      healthy: true,
      agent: { name: 'plaf203-state-agent', version: '0.3.0', uptimeMs: 100 },
      stateDecode: { ok: true, expectedBytes: 236, actualBytes: 236 },
    },
  } as const,
}));

vi.mock('#/infrastructure/http/operations-client', () => ({
  fetchStateAgentInspectionAction: vi.fn().mockResolvedValue({
    id: 'state-agent.inspect-health',
    title: 'Inspect State Agent health',
    description: 'Read-only health inspection.',
    available: true,
    mode: 'read-only',
  }),
  fetchOperations: vi.fn().mockResolvedValue([operation]),
  fetchOperationDetail: vi.fn().mockResolvedValue({
    operation,
    events: [
      {
        sequence: 1,
        sourceEventKey: 'management:accepted',
        operationId: operation.operationId,
        type: 'operation.accepted',
        source: 'management-application',
        severity: 'info',
        occurredAt: operation.createdAt,
        ingestedAt: operation.createdAt,
        payload: {},
      },
      {
        sequence: 2,
        sourceEventKey: 'worker:evidence',
        operationId: operation.operationId,
        type: 'capability.evidence',
        source: 'python-worker',
        severity: 'info',
        occurredAt: operation.updatedAt,
        ingestedAt: operation.updatedAt,
        payload: {},
      },
    ],
    nextEventCursor: 2,
  }),
  operationEventsWebSocketUrl: vi.fn(),
  startStateAgentInspection: vi.fn(),
}));

describe('OperationsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('presents source-scoped State Agent evidence from a durable operation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText('State Agent reported healthy'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/authenticated State Agent response/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/not feeder connectivity/i)).toBeInTheDocument();
    expect(await screen.findByText('Capability evidence')).toBeInTheDocument();
  });

  it('reconnects live observations from the last delivered cursor', async () => {
    const {
      completedAt: _completedAt,
      result: _result,
      ...operationBase
    } = operation;
    const runningOperation = {
      ...operationBase,
      status: 'running' as const,
      stage: 'requesting-state-agent-health',
    };
    vi.mocked(fetchOperations).mockResolvedValue([runningOperation]);
    vi.mocked(fetchOperationDetail).mockResolvedValue({
      operation: runningOperation,
      events: [],
      nextEventCursor: 2,
    });
    vi.mocked(operationEventsWebSocketUrl).mockImplementation(
      (operationId, cursor) => `ws://test/${operationId}?after=${cursor}`,
    );
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <OperationsPage />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(FakeWebSocket.instances[0]?.url).toContain('after=2');

    FakeWebSocket.instances[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({ cursor: 7, events: [] }),
      }),
    );
    FakeWebSocket.instances[0]?.emit('close', new Event('close'));

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2), {
      timeout: 1_500,
    });
    expect(FakeWebSocket.instances[1]?.url).toContain('after=7');
    view.unmount();
  });
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  private readonly listeners = new Map<
    string,
    Set<EventListenerOrEventListenerObject>
  >();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {}

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}
