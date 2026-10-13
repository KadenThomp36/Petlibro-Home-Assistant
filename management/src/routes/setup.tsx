import { createFileRoute } from '@tanstack/react-router';
import { SetupPage } from '#/components/setup/setup-page';

export const Route = createFileRoute('/setup')({
  component: SetupPage,
});
