import { createFileRoute } from '@tanstack/react-router';
import { BookOpenText } from 'lucide-react';
import { FeatureBoundaryPage } from '#/components/shared/feature-boundary-page';

export const Route = createFileRoute('/logs')({
  component: () => (
    <FeatureBoundaryPage
      eyebrow="Bounded observability"
      title="Logs"
      description="Correlated application and service logs will share one redacted viewing experience."
      icon={BookOpenText}
      owner="Observability delivery and retention boundary"
      futureInput="Structured logs and bounded process output from identified producers"
      futureOutput="Filterable live and historical views with operation and source correlation"
      exclusion="Unbounded browser buffers, secret-bearing payloads, raw packet capture, and video transport"
    />
  ),
});
