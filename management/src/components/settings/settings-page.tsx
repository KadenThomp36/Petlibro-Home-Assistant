import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Network, Palette, ShieldCheck } from 'lucide-react';
import { PageHeader } from '#/components/layout/application-shell';
import { ThemeToggle } from '#/components/layout/theme-toggle';
import {
  AvailabilityBadge,
  SectionHeading,
} from '#/components/shared/presentation';
import { Badge } from '#/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card';
import { fetchSystemStatus } from '#/infrastructure/http/system-status-client';

export function SettingsPage() {
  const statusQuery = useQuery({
    queryKey: ['system-status'],
    queryFn: ({ signal }) => fetchSystemStatus(signal),
  });
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Configuration custody"
        title="Settings"
        description="Distinguish browser preferences from Home Assistant add-on options and externally owned service configuration."
      />

      <section>
        <SectionHeading eyebrow="Management preferences" title="This browser" />
        <Card>
          <CardContent className="settings-row">
            <span className="card-icon" aria-hidden="true">
              <Palette />
            </span>
            <div>
              <strong>Color theme</strong>
              <p>
                Stored locally in this browser. It does not change add-on
                configuration.
              </p>
            </div>
            <ThemeToggle />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeading
          eyebrow="Runtime integrations"
          title="Observed adapter configuration"
        />
        <div className="settings-card-list">
          {(statusQuery.data?.integrations ?? []).map((integration) => (
            <Card key={integration.id}>
              <CardContent className="settings-row">
                <span className="card-icon" aria-hidden="true">
                  <Network />
                </span>
                <div>
                  <strong>{integration.name}</strong>
                  <p>{integration.detail}</p>
                </div>
                <AvailabilityBadge availability={integration.availability} />
              </CardContent>
            </Card>
          ))}
          {statusQuery.isError ? (
            <p className="operation-inline-error" role="alert">
              {statusQuery.error.message}
            </p>
          ) : null}
        </div>
      </section>

      <div className="two-column-grid">
        <Card>
          <CardHeader>
            <CardTitle>Network access</CardTitle>
            <CardDescription>
              Owned by Home Assistant add-on options
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="card-copy">
              Ingress and optional direct LAN access use the same backend.
              Direct access is unauthenticated by this application and must
              remain on a trusted LAN or behind an authenticated reverse proxy.
            </p>
            <div className="ownership-label">
              <ExternalLink aria-hidden="true" />
              <span>Change access settings in the add-on configuration.</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Credentials & recovery</CardTitle>
            <CardDescription>Protected workflow required</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="card-copy">
              State Agent tokens, broker credentials, signing material, and
              recovery keys are never displayed here. No credential-management
              adapter is implemented.
            </p>
            <div className="ownership-label">
              <ShieldCheck aria-hidden="true" />
              <span>
                Secrets remain outside browser-visible status contracts.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>Management application contract</CardDescription>
        </CardHeader>
        <CardContent className="about-row">
          <div>
            <span>Application</span>
            <strong>Petlibro Management</strong>
          </div>
          <div>
            <span>Version</span>
            <strong>
              {statusQuery.data?.management.version ?? 'Unavailable'}
            </strong>
          </div>
          <div>
            <span>API</span>
            <Badge variant="outline">
              {statusQuery.data?.apiVersion ?? 'Unknown'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
