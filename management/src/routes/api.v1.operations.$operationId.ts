import { createFileRoute } from '@tanstack/react-router';
import { OperationNotFoundError } from '#/application/operation-manager';
import { getApplicationServices } from '#/server/application-services';

export const Route = createFileRoute('/api/v1/operations/$operationId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const rawCursor = new URL(request.url).searchParams.get('after');
        const after = rawCursor === null ? 0 : Number(rawCursor);
        if (!Number.isSafeInteger(after) || after < 0) {
          return noStoreJson(
            { error: 'invalid_cursor', message: 'after must be non-negative' },
            400,
          );
        }
        try {
          return noStoreJson(
            await getApplicationServices().operations.getOperationDetail(
              params.operationId,
              after,
            ),
          );
        } catch (error) {
          if (error instanceof OperationNotFoundError) {
            return noStoreJson(
              { error: 'operation_not_found', message: error.message },
              404,
            );
          }
          throw error;
        }
      },
    },
  },
});

function noStoreJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
