import { createFileRoute } from '@tanstack/react-router';
import { Wrench } from 'lucide-react';
import { FeatureBoundaryPage } from '#/components/shared/feature-boundary-page';

export const Route = createFileRoute('/actions')({
  component: () => (
    <FeatureBoundaryPage
      eyebrow="Reusable intent"
      title="Actions"
      description="Supported maintenance and recovery actions will share one application-owned model."
      icon={Wrench}
      owner="Action catalog and action service"
      futureInput="Authorized user intent validated against the action's application schema"
      futureOutput="An accepted operation reference or a structured rejection"
      exclusion="Arbitrary commands, generic shell access, and buttons for capabilities that do not exist"
    />
  ),
});
