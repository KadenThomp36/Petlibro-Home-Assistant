import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Check,
  CircleDashed,
  KeyRound,
  LockKeyhole,
  Router,
} from 'lucide-react';
import { PageHeader } from '#/components/layout/application-shell';
import {
  AvailabilityBadge,
  CapabilityGap,
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
import { fetchSystemStatus } from '#/infrastructure/http/system-status-client';

const setupStages = [
  ['Preflight', 'Management and local network readiness'],
  ['Target & broker', 'Feeder target and final broker configuration'],
  ['Recovery', 'Protected recovery key and bootstrap artifacts'],
  ['Identity capture', 'Temporary broker and feeder identity evidence'],
  ['Guarded install', 'Credential proof, OTA, and restart'],
  ['Verification', 'Broker handoff and runtime adoption'],
] as const;

export function SetupPage() {
  const statusQuery = useQuery({
    queryKey: ['system-status'],
    queryFn: ({ signal }) => fetchSystemStatus(signal),
  });
  const worker = statusQuery.data?.integrations.find(
    (item) => item.id === 'python-worker',
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Guided installation"
        title="Setup"
        description="Prepare a safe, checkpointed installation without hiding device-changing boundaries or claiming unverified broker handoff behavior."
      >
        <Button asChild variant="outline">
          <Link to="/operations">View operations</Link>
        </Button>
      </PageHeader>

      <div className="setup-layout">
        <Card className="setup-stage-card">
          <CardHeader>
            <CardTitle>Installation stages</CardTitle>
            <CardDescription>
              Conceptual groups; execution ordering remains capability-owned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="setup-stage-list">
              {setupStages.map(([title, detail], index) => (
                <li key={title} data-state={index === 0 ? 'current' : 'locked'}>
                  <span aria-hidden="true">
                    {index === 0 ? <CircleDashed /> : <LockKeyhole />}
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="setup-primary">
          <CapabilityGap
            icon={Router}
            title="Guided setup is not available yet"
            description="The proven installer remains a CLI/reference path. Its private protocol dependencies, checkpoints, and transaction ownership have not yet been exposed through a stable worker capability."
          />
          <Card>
            <CardHeader>
              <CardTitle>Foundation readiness</CardTitle>
              <CardDescription>
                These checks do not inspect the feeder or broker.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="check-list">
                <li>
                  <Check aria-hidden="true" />
                  <span>
                    <strong>Management API</strong>
                    <small>
                      {statusQuery.isSuccess
                        ? 'Available in this browser session'
                        : 'Status not confirmed'}
                    </small>
                  </span>
                  <Badge
                    className={
                      statusQuery.isSuccess ? 'status-ready' : 'status-warning'
                    }
                  >
                    {statusQuery.isSuccess ? 'Ready' : 'Unknown'}
                  </Badge>
                </li>
                <li>
                  <KeyRound aria-hidden="true" />
                  <span>
                    <strong>Device operations worker</strong>
                    <small>
                      {worker?.detail ?? 'Worker status has not been observed.'}
                    </small>
                  </span>
                  {worker === undefined ? (
                    <Badge variant="secondary">Unknown</Badge>
                  ) : (
                    <AvailabilityBadge availability={worker.availability} />
                  )}
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
