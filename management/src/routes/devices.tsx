import { createFileRoute } from '@tanstack/react-router';
import { Boxes } from 'lucide-react';
import { FeatureBoundaryPage } from '#/components/shared/feature-boundary-page';

export const Route = createFileRoute('/devices')({
  component: () => (
    <FeatureBoundaryPage
      eyebrow="Device projection"
      title="Devices"
      description="Stable management identity will meet source-aware runtime observations here."
      icon={Boxes}
      owner="Management device registry and projection service"
      futureInput="Installer identity and supported AppDaemon, State Agent, and go2rtc observations"
      futureOutput="A coherent device view retaining source, freshness, scope, and availability"
      exclusion="Runtime discovery authority, persistent feeder writes, and multi-feeder guided installation"
    />
  ),
});
