import { createFileRoute } from '@tanstack/react-router';
import { getApplicationServices } from '#/server/application-services';

export const Route = createFileRoute('/api/v1/operations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestedLimit = new URL(request.url).searchParams.get('limit');
        const limit = requestedLimit === null ? 20 : Number(requestedLimit);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          return Response.json(
            {
              error: 'invalid_limit',
              message: 'limit must be between 1 and 100',
            },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
          );
        }
        const operations =
          await getApplicationServices().operations.listOperations(limit);
        return Response.json(
          { operations },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      },
    },
  },
});
