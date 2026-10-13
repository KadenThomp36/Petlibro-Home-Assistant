import { createFileRoute } from '@tanstack/react-router';
import { Stethoscope } from 'lucide-react';
import { FeatureBoundaryPage } from '#/components/shared/feature-boundary-page';

export const Route = createFileRoute('/diagnostics')({
  component: () => (
    <FeatureBoundaryPage
      eyebrow="Source-aware checks"
      title="Diagnostics"
      description="Observed facts and diagnostic inference will remain visibly distinct."
      icon={Stethoscope}
      owner="Diagnostics application service"
      futureInput="Typed read-only observations from authorized runtime and device adapters"
      futureOutput="Checks and reports with source, observation time, evidence, and inference"
      exclusion="Generic remote inspection, authority over source facts, and hidden device-changing tests"
    />
  ),
});
