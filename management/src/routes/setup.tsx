import { createFileRoute } from '@tanstack/react-router';
import { ListChecks } from 'lucide-react';
import { FeatureBoundaryPage } from '#/components/shared/feature-boundary-page';

export const Route = createFileRoute('/setup')({
  component: () => (
    <FeatureBoundaryPage
      eyebrow="Application coordination"
      title="Setup"
      description="The guided installation workflow will remain separate from device transaction mechanics."
      icon={ListChecks}
      owner="TypeScript installation coordinator"
      futureInput="Validated user intent, durable checkpoints, and capability requirements"
      futureOutput="A durable installation operation with evidence-backed outcomes"
      exclusion="OEM protocol internals, temporary broker sockets, OTA state machines, and same-host broker assumptions"
    />
  ),
});
