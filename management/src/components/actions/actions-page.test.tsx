import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionsPage } from './actions-page';

vi.mock('#/infrastructure/http/operations-client', () => ({
  fetchStateAgentInspectionAction: vi.fn().mockResolvedValue({
    id: 'state-agent.inspect-health',
    title: 'Inspect State Agent health',
    description: 'Read-only health inspection.',
    available: false,
    unavailableReason: 'State Agent server configuration is incomplete.',
    mode: 'read-only',
  }),
}));

describe('ActionsPage', () => {
  it('keeps unavailable capabilities visibly disabled and omits speculative actions', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ActionsPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        'State Agent server configuration is incomplete.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open action' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /factory reset/i }),
    ).not.toBeInTheDocument();
  });
});
