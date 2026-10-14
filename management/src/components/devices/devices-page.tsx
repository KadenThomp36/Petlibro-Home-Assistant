import { useQuery } from '@tanstack/react-query';
import { Camera, Database, Radio, RefreshCw, Search } from 'lucide-react';
import { PageHeader } from '#/components/layout/application-shell';
import {
  AvailabilityBadge,
  EmptyState,
  humanize,
  ObservationNote,
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
import type { DeviceProjection } from '#/domain/device-overview';
import { fetchDeviceOverview } from '#/infrastructure/http/device-overview-client';

export function DevicesPage() {
  const query = useQuery({
    queryKey: ['device-overview'],
    queryFn: ({ signal }) => fetchDeviceOverview(signal),
    refetchInterval: 30_000,
  });
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Device projection"
        title="Devices"
        description="Correlated AppDaemon discovery, verified controller state, and go2rtc session observations. Each field retains its source and limitations."
      >
        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            className={query.isFetching ? 'animate-spin' : undefined}
          />
          Refresh
        </Button>
      </PageHeader>

      {query.isError ? (
        <Card className="status-error" role="alert">
          <CardHeader>
            <CardTitle>Device projection unavailable</CardTitle>
            <CardDescription>{query.error.message}</CardDescription>
          </CardHeader>
        </Card>
      ) : query.data === undefined ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : query.data.devices.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title="No feeder identity observed"
              description="AppDaemon discovery has not produced a supported PLAF203 registry record. This does not prove that no feeder exists."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="device-card-list">
          {query.data.devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}

      <section aria-labelledby="identity-boundary-title">
        <SectionHeading
          eyebrow="Identity boundary"
          title="How records are correlated"
          aside={
            <span className="section-note">
              One feeder per add-on supported
            </span>
          }
        />
        <div className="truth-callout" id="identity-boundary-title">
          <Search aria-hidden="true" />
          <div>
            <strong>Discovery is not device health</strong>
            <p>
              Product and serial correlate configuration, discovery, controller,
              and camera observations. Dynamic IP and UID provenance remains
              with AppDaemon; persistent feeder truth remains State
              Agent-verified.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeviceCard({ device }: { readonly device: DeviceProjection }) {
  const verified = device.controller?.verifiedState;
  return (
    <Card className="device-card">
      <CardHeader>
        <div className="card-heading-row">
          <span className="card-icon" aria-hidden="true">
            <Radio />
          </span>
          <div>
            <CardTitle>
              {device.product} · {device.serial}
            </CardTitle>
            <CardDescription>
              {device.configured
                ? 'Manual configuration correlated with runtime'
                : 'Discovered by AppDaemon'}
            </CardDescription>
          </div>
          <AvailabilityBadge availability={device.availability} />
        </div>
      </CardHeader>
      <CardContent>
        <dl className="device-facts">
          <Fact label="Address" value={device.ipAddress ?? 'Not resolved'} />
          <Fact
            label="Camera UID"
            value={device.uidDisplay ?? 'Not observed'}
          />
          <Fact label="Last MQTT" value={formatOptional(device.lastMqttSeen)} />
          <Fact label="Stream" value={device.streamName ?? 'Not configured'} />
        </dl>

        <div className="device-observation-grid">
          <div className="device-observation-panel">
            <div className="device-panel-title">
              <Database aria-hidden="true" />
              <strong>Routine controller</strong>
              <AvailabilityBadge
                availability={device.controller?.availability ?? 'unavailable'}
              />
            </div>
            {device.controller === null ? (
              <p>No supported AppDaemon controller status is available.</p>
            ) : (
              <>
                <dl className="compact-facts">
                  <Fact
                    label="Reconciliation"
                    value={humanize(device.controller.reconciliationState)}
                  />
                  <Fact
                    label="Feeder MQTT"
                    value={
                      device.controller.feederMqttConnected
                        ? 'Connected'
                        : 'Disconnected'
                    }
                  />
                  <Fact
                    label="State Agent"
                    value={
                      device.controller.stateAgentHealthy
                        ? 'Verified reads healthy'
                        : 'Unavailable'
                    }
                  />
                  <Fact
                    label="Writes"
                    value={
                      device.controller.writesReady
                        ? 'Controller ready'
                        : device.controller.writePending
                          ? 'Pending'
                          : 'Not ready'
                    }
                  />
                  <Fact
                    label="Plans"
                    value={
                      verified == null
                        ? 'Not verified'
                        : String(verified.planCount)
                    }
                  />
                  <Fact
                    label="Core revision"
                    value={verified?.revisions.core_rev ?? 'Not verified'}
                    mono
                  />
                </dl>
                <ObservationNote
                  source={device.controller.observation.source}
                  observedAt={
                    device.controller.observation.observedAt ??
                    device.controller.observation.collectedAt
                  }
                  scope={device.controller.observation.scope}
                />
              </>
            )}
          </div>

          <div className="device-observation-panel">
            <div className="device-panel-title">
              <Camera aria-hidden="true" />
              <strong>Camera session</strong>
              <AvailabilityBadge
                availability={device.camera?.availability ?? 'not-configured'}
              />
            </div>
            {device.camera === null ? (
              <p>No stream is configured for this feeder.</p>
            ) : (
              <>
                <dl className="compact-facts">
                  <Fact
                    label="Physical session"
                    value={
                      device.camera.status === null
                        ? 'Not observed'
                        : humanize(device.camera.status)
                    }
                  />
                  <Fact
                    label="Requested quality"
                    value={
                      device.camera.requestedQuality?.toUpperCase() ??
                      'Unavailable'
                    }
                  />
                  <Fact
                    label="Observed video"
                    value={
                      device.camera.resolution === null
                        ? 'Unavailable'
                        : `${device.camera.resolution.width} × ${device.camera.resolution.height}`
                    }
                  />
                  <Fact
                    label="Dropped frames"
                    value={formatCounter(device.camera.health?.dropped_frames)}
                  />
                </dl>
                <ObservationNote
                  source={device.camera.observation.source}
                  observedAt={
                    device.camera.observation.observedAt ??
                    device.camera.observation.collectedAt
                  }
                  scope={device.camera.observation.scope}
                />
              </>
            )}
          </div>
        </div>

        {device.warnings.length === 0 ? null : (
          <output className="device-warning-list">
            {device.warnings.map((warning) => (
              <Badge key={warning} className="status-warning">
                {warning}
              </Badge>
            ))}
          </output>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? 'mono-value' : undefined}>{value}</dd>
    </div>
  );
}

function formatOptional(value: string | null): string {
  return value === null
    ? 'Not observed'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
}

function formatCounter(value: number | null | undefined): string {
  return value === null || value === undefined
    ? 'Unavailable'
    : value.toLocaleString();
}
