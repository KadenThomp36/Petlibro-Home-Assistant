import { createFileRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { FeatureBoundaryPage } from '#/components/shared/feature-boundary-page';

export const Route = createFileRoute('/settings')({
  component: () => (
    <FeatureBoundaryPage
      eyebrow="Configuration custody"
      title="Settings"
      description="Application settings and Supervisor-owned add-on options require separate authority paths."
      icon={Settings}
      owner="Management configuration service and approved platform adapter"
      futureInput="Application-owned preferences or permission-checked integration change requests"
      futureOutput="Saved application settings or verified configuration adoption results"
      exclusion="Direct options.json edits, unverified restarts, secret display, and unrestricted Supervisor access"
    />
  ),
});
