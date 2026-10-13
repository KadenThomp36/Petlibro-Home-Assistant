import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleHelp, ServerCog, Stethoscope } from 'lucide-react';
import { PageHeader } from '#/components/layout/application-shell';
import {
  AvailabilityBadge,
  ObservationNote,
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
import { fetchStateAgentInspectionAction } from '#/infrastructure/http/operations-client';
import { fetchSystemStatus } from '#/infrastructure/http/system-status-client';

export function DiagnosticsPage() {
  const statusQuery = useQuery({
    queryKey: ['system-status'],
    queryFn: ({ signal }) => fetchSystemStatus(signal),
  });
  const actionQuery = useQuery({
    queryKey: ['actions', 'state-agent-inspection'],
    queryFn: ({ signal }) => fetchStateAgentInspectionAction(signal),
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Source-aware checks"
        title="Diagnostics"
        description="Separate observed facts, query failures, and diagnostic interpretation for each subsystem."
      >
        {actionQuery.data?.available ? (
          <Button asChild>
            <Link to="/operations">
              <Stethoscope aria-hidden="true" /> Run available check
            </Link>
          </Button>
        ) : (
          <Button disabled>
            <Stethoscope aria-hidden="true" /> Run available check
          </Button>
        )}
      </PageHeader>

      <div className="diagnostics-layout">
        <Card className="diagnostic-sources-card">
          <CardHeader>
            <CardTitle>Subsystem sources</CardTitle>
            <CardDescription>
              Adapter availability, not a fused health score.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusQuery.isError ? (
              <p className="operation-inline-error" role="alert">
                {statusQuery.error.message}
              </p>
            ) : (
              <ul className="diagnostic-source-list">
                {(statusQuery.data?.integrations ?? []).map((integration) => (
                  <li key={integration.id}>
                    <span>
                      <strong>{integration.name}</strong>
                      <small>{integration.detail}</small>
                    </span>
                    <AvailabilityBadge
                      availability={integration.availability}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="diagnostic-detail-card">
          <CardHeader>
            <div className="card-heading-row">
              <span className="card-icon" aria-hidden="true">
                <ServerCog />
              </span>
              <div>
                <CardTitle>State Agent inspection</CardTitle>
                <CardDescription>
                  Authenticated, read-only health check
                </CardDescription>
              </div>
              {actionQuery.data?.available ? (
                <Badge className="status-ready">Runnable</Badge>
              ) : (
                <Badge variant="secondary">Unavailable</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="card-copy">
              {actionQuery.error?.message ??
                actionQuery.data?.unavailableReason ??
                actionQuery.data?.description ??
                'Checking the worker capability boundary.'}
            </p>
            <div className="interpretation-box">
              <CircleHelp aria-hidden="true" />
              <div>
                <strong>Scope limitation</strong>
                <p>
                  A successful result confirms the authenticated State Agent
                  response and state decoding only. It does not establish
                  broker, feeder connectivity, or controller readiness.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {statusQuery.data === undefined ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Management observation</CardTitle>
            <CardDescription>
              The application can report its own process status while external
              adapters remain unavailable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ObservationNote
              source={statusQuery.data.management.observation.source}
              observedAt={statusQuery.data.management.observation.observedAt}
              scope={statusQuery.data.management.observation.scope}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
