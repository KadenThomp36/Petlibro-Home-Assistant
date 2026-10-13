import { createFileRoute } from '@tanstack/react-router';
import { DiagnosticsPage } from '#/components/diagnostics/diagnostics-page';

export const Route = createFileRoute('/diagnostics')({
  component: DiagnosticsPage,
});
