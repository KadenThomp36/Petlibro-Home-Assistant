import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FileClock } from 'lucide-react';
import { PageHeader } from '#/components/layout/application-shell';
import { OperationList } from '#/components/shared/operation-list';
import { EmptyState, SectionHeading } from '#/components/shared/presentation';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { Skeleton } from '#/components/ui/skeleton';
import { fetchOperations } from '#/infrastructure/http/operations-client';

export function HistoryPage() {
  const operationsQuery = useQuery({
    queryKey: ['operations'],
    queryFn: ({ signal }) => fetchOperations(signal),
    refetchInterval: 5_000,
  });
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Significant events"
        title="History"
        description="Review durable operation outcomes without treating historical observations as current feeder state."
      />
      <section aria-labelledby="history-title">
        <SectionHeading
          eyebrow="Durable journal"
          title="Operation activity"
          aside={<span className="section-note">Most recent 20</span>}
        />
        <Card id="history-title">
          <CardContent>
            {operationsQuery.isPending ? (
              <Skeleton className="h-48" />
            ) : operationsQuery.isError ? (
              <p className="operation-inline-error" role="alert">
                {operationsQuery.error.message}
              </p>
            ) : operationsQuery.data.length === 0 ? (
              <EmptyState
                title="No significant events recorded"
                description="Accepted capability operations will appear here with their durable result classification."
              >
                <Button asChild variant="outline">
                  <Link to="/actions">View actions</Link>
                </Button>
              </EmptyState>
            ) : (
              <OperationList operations={operationsQuery.data} />
            )}
          </CardContent>
        </Card>
      </section>
      <div className="truth-callout">
        <FileClock aria-hidden="true" />
        <div>
          <strong>Current scope</strong>
          <p>
            History currently includes management operation lifecycles only.
            Device changes and runtime events need source adapters before they
            can be represented honestly.
          </p>
        </div>
      </div>
    </div>
  );
}
