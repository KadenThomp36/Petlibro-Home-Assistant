import { createFileRoute } from '@tanstack/react-router';
import { OverviewPage } from '#/components/overview/overview-page';

export const Route = createFileRoute('/')({ component: OverviewPage });
