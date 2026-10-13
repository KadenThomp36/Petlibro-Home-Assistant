import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Check,
  CircleOff,
  ListChecks,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import {
  ConnectionBanner,
  PageHeader,
} from '#/components/layout/application-shell';
import { OperationList } from '#/components/shared/operation-list';
import {
  AvailabilityBadge,
  EmptyState,
  SectionHeading,
} from '#/components/shared/presentation';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card';
import { Skeleton } from '#/components/ui/skeleton';
import type { SystemStatusSnapshot } from '#/domain/system-status';
import { fetchOperations } from '#/infrastructure/http/operations-client';
import { fetchSystemStatus } from '#/infrastructure/http/system-status-client';

type SystemStatusQuery = UseQueryResult<SystemStatusSnapshot, Error>;

export function OverviewPage() {
  const statusQuery = useQuery({
    queryKey: ['system-status'],
    queryFn: ({ signal }) => fetchSystemStatus(signal),
    refetchInterval: 30_000,
  });
  const operationsQuery = useQuery({
    queryKey: ['operations'],
    queryFn: ({ signal }) => fetchOperations(signal),
    refetchInterval: 5_000,
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Local management foundation"
        title="Overview"
        description="Check management availability and the current integration boundaries without treating missing device observations as healthy state."
      >
        <Button
          variant="outline"
          onClick={() => statusQuery.refetch()}
          disabled={statusQuery.isFetching}
        >
          <RefreshCw
            aria-hidden="true"
            className={statusQuery.isFetching ? 'animate-spin' : undefined}
          />
          Refresh status
        </Button>
      </PageHeader>

      <ConnectionBanner />

      <Card className="first-run-card">
        <CardContent>
          <span className="next-boundary-icon" aria-hidden="true">
            <ListChecks />
          </span>
          <div>
            <p className="eyebrow">Device setup</p>
            <h2>No device projection is configured</h2>
            <p>
              The management application cannot yet identify or summarize a
              feeder. Review the setup boundary and current foundation readiness
              without assuming the operational services are healthy.
            </p>
          </div>
          <Button asChild>
            <Link to="/setup">Review setup</Link>
          </Button>
        </CardContent>
      </Card>

      <section className="status-grid" aria-label="Foundation status">
        <ManagementStatusCard query={statusQuery} />
        <Card className="guardrail-card">
          <CardHeader>
            <div className="card-heading-row">
              <span className="card-icon card-icon-amber" aria-hidden="true">
                <ShieldCheck />
              </span>
              <div>
                <CardTitle>Authority guardrail</CardTitle>
                <CardDescription>
                  Existing services remain in control.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="guardrail-copy">
              AppDaemon still owns routine feeder writes. go2rtc still owns
              camera transport. The State Agent still supplies persistent feeder
              truth.
            </p>
            <div className="guardrail-rule">
              Intent flows down <ArrowRight aria-hidden="true" /> evidence flows
              up.
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="integration-boundaries-title">
        <SectionHeading
          eyebrow="Service health"
          title="Honest status, by source"
          aside={<Badge variant="outline">No device data queried</Badge>}
        />
        <IntegrationGrid query={statusQuery} />
      </section>

      <section aria-labelledby="recent-operations-title">
        <SectionHeading
          eyebrow="Recent activity"
          title="Durable operations"
          aside={
            <Button asChild size="sm" variant="outline">
              <Link to="/operations">View all</Link>
            </Button>
          }
        />
        <Card id="recent-operations-title">
          <CardContent>
            {operationsQuery.isError ? (
              <p className="operation-inline-error" role="alert">
                {operationsQuery.error.message}
              </p>
            ) : operationsQuery.data === undefined ? (
              <Skeleton className="h-28" />
            ) : operationsQuery.data.length === 0 ? (
              <EmptyState
                title="No operations recorded"
                description="The available read-only inspection will appear here after it is accepted."
              >
                <Button asChild size="sm" variant="outline">
                  <Link to="/actions">View actions</Link>
                </Button>
              </EmptyState>
            ) : (
              <OperationList operations={operationsQuery.data} limit={3} />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ManagementStatusCard({
  query,
}: {
  readonly query: SystemStatusQuery;
}) {
  if (query.isPending) {
    return (
      <Card aria-label="Loading management API status">
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card className="status-error" role="alert">
        <CardHeader>
          <CardTitle>Management API unavailable</CardTitle>
          <CardDescription>{errorMessage(query.error)}</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            The browser shell is running, but its server status request failed.
          </p>
        </CardContent>
      </Card>
    );
  }

  const status = query.data.management;

  return (
    <Card className="management-status-card">
      <CardHeader>
        <div className="card-heading-row">
          <span className="card-icon" aria-hidden="true">
            <Server />
          </span>
          <div>
            <CardTitle>{status.name}</CardTitle>
            <CardDescription>
              Observed from {status.observation.source}
            </CardDescription>
          </div>
          <Badge className="status-ready">
            <Check aria-hidden="true" /> Ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="status-detail">{status.detail}</p>
        <dl className="status-metadata">
          <div>
            <dt>Version</dt>
            <dd>{status.version}</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{formatObservedAt(status.observation.observedAt)}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{status.observation.scope}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function IntegrationGrid({ query }: { readonly query: SystemStatusQuery }) {
  if (query.isPending) {
    return (
      <div className="integration-grid">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="muted-message">
        Integration boundaries could not be loaded.
      </p>
    );
  }

  return (
    <div className="integration-grid">
      {query.data.integrations.map((integration) => (
        <Card key={integration.id} className="integration-card">
          <CardHeader>
            <div className="integration-title">
              <CircleOff aria-hidden="true" />
              <CardTitle>{integration.name}</CardTitle>
            </div>
            <AvailabilityBadge availability={integration.availability} />
          </CardHeader>
          <CardContent>
            <p>{integration.detail}</p>
            <small>{integration.observation.scope}</small>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatObservedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'An unknown request error occurred.';
}
