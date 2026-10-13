import { createFileRoute } from '@tanstack/react-router';
import { getApplicationServices } from '#/server/application-services';

export const Route = createFileRoute('/api/v1/system/status')({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          await getApplicationServices().systemStatus.getSnapshot(),
          {
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        ),
    },
  },
});
