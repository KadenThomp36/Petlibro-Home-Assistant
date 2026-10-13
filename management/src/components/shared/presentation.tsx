import type { LucideIcon } from 'lucide-react';
import { CircleDashed, DatabaseZap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '#/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card';
import type { OperationStatus } from '#/domain/operations';
import type { IntegrationAvailability } from '#/domain/system-status';

export function StatusBadge({ status }: { readonly status: OperationStatus }) {
  if (status === 'succeeded') {
    return <Badge className="status-ready">Succeeded</Badge>;
  }
  if (status === 'failed' || status === 'cancelled') {
    return <Badge variant="destructive">{humanize(status)}</Badge>;
  }
  if (status === 'interrupted' || status === 'indeterminate') {
    return <Badge className="status-warning">{humanize(status)}</Badge>;
  }
  return <Badge className="status-running">{humanize(status)}</Badge>;
}

export function AvailabilityBadge({
  availability,
}: {
  readonly availability: IntegrationAvailability;
}) {
  if (availability === 'ready') {
    return <Badge className="status-ready">Ready</Badge>;
  }
  if (availability === 'unavailable') {
    return <Badge className="status-warning">Unavailable</Badge>;
  }
  return <Badge variant="secondary">Not configured</Badge>;
}

export function SectionHeading({
  eyebrow,
  title,
  aside,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly aside?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export function CapabilityGap({
  icon: Icon = DatabaseZap,
  title,
  description,
  children,
  compact = false,
}: {
  readonly icon?: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
  readonly compact?: boolean;
}) {
  return (
    <Card
      className={
        compact ? 'capability-gap capability-gap-compact' : 'capability-gap'
      }
    >
      <CardContent>
        <span className="feature-icon" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <Badge variant="secondary">Capability unavailable</Badge>
          <h2>{title}</h2>
          <p>{description}</p>
          {children === undefined ? null : (
            <div className="capability-gap-actions">{children}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <CircleDashed aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

export function ObservationNote({
  source,
  observedAt,
  scope,
}: {
  readonly source: string;
  readonly observedAt: string;
  readonly scope: string;
}) {
  return (
    <div className="observation-note">
      <span>{source}</span>
      <time dateTime={observedAt}>{formatDateTime(observedAt)}</time>
      <small>{scope}</small>
    </div>
  );
}

export function LabeledCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description === undefined ? null : (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function humanize(value: string): string {
  const text = value.replaceAll(/[._-]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}
