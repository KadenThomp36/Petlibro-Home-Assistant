import { createFileRoute } from '@tanstack/react-router';
import { getApplicationServices } from '#/server/application-services';

export const Route = createFileRoute('/api/v1/devices/overview')({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          await getApplicationServices().deviceOverview.getSnapshot(),
          { headers: { 'Cache-Control': 'no-store' } },
        ),
    },
  },
});
