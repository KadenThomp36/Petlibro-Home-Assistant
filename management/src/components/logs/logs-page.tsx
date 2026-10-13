import { BookOpenText, Filter, Pause, Search } from 'lucide-react';
import { PageHeader } from '#/components/layout/application-shell';
import { CapabilityGap } from '#/components/shared/presentation';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';

export function LogsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Bounded observability"
        title="Logs"
        description="Explore identified, redacted producers without turning the browser into an unbounded buffer or command console."
      />

      <Card className="log-viewer-shell">
        <CardContent>
          <div
            className="log-toolbar"
            role="toolbar"
            aria-label="Log filters unavailable"
          >
            <span>
              <Search aria-hidden="true" /> Search logs
            </span>
            <span>
              <Filter aria-hidden="true" /> Source and severity
            </span>
            <Button size="sm" variant="outline" disabled>
              <Pause aria-hidden="true" /> Pause follow
            </Button>
          </div>
          <div className="log-empty">
            <BookOpenText aria-hidden="true" />
            <strong>No log source adapter</strong>
            <p>
              Execution evidence is available in Operations. Runtime service
              logs are not yet delivered through a bounded, redacted management
              contract.
            </p>
            <Badge variant="secondary">No records loaded</Badge>
          </div>
        </CardContent>
      </Card>

      <CapabilityGap
        compact
        title="Live and historical logs are not configured"
        description="Future adapters must identify the producer, enforce retention and redaction, and preserve operation correlation. Raw captures, secrets, and camera media will not enter this view."
      />
    </div>
  );
}
