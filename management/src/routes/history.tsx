import { createFileRoute } from '@tanstack/react-router';
import { FileClock } from 'lucide-react';
import { FeatureBoundaryPage } from '#/components/shared/feature-boundary-page';

export const Route = createFileRoute('/history')({
  component: () => (
    <FeatureBoundaryPage
      eyebrow="Significant events"
      title="History"
      description="Historical facts will stay distinct from current device or actuator state."
      icon={FileClock}
      owner="Application event journal and history projection"
      futureInput="Durable lifecycle, evidence, and selected source-labeled observation events"
      futureOutput="Retained significant changes with correlation and provenance"
      exclusion="Treating old observations as live truth or retaining every telemetry sample indefinitely"
    />
  ),
});
