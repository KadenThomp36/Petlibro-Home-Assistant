import { createFileRoute } from '@tanstack/react-router';
import { ActionsPage } from '#/components/actions/actions-page';

export const Route = createFileRoute('/actions')({
  component: ActionsPage,
});
