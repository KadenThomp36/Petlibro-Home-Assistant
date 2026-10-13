import { createFileRoute } from '@tanstack/react-router';
import { OperationsPage } from '#/components/operations/operations-page';

export const Route = createFileRoute('/operations')({
  component: OperationsPage,
});
