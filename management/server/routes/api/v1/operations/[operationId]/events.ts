import { defineWebSocketHandler } from 'nitro';
import { OperationNotFoundError } from '#/application/operation-manager';
import { getApplicationServices } from '#/server/application-services';

interface OperationPeerContext {
  operationId: string;
  cursor: number;
  polling?: ReturnType<typeof setInterval>;
  sending: boolean;
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(
      /\/api\/v1\/operations\/([^/]+)\/events$/,
    );
    if (match?.[1] === undefined) {
      throw new Response('Not found', { status: 404 });
    }
    const cursor = Number(url.searchParams.get('after') ?? '0');
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new Response('Invalid event cursor', { status: 400 });
    }
    const operationId = decodeURIComponent(match[1]);
    try {
      await getApplicationServices().operations.getOperation(operationId);
    } catch (error) {
      if (error instanceof OperationNotFoundError) {
        throw new Response('Operation not found', { status: 404 });
      }
      throw error;
    }
    return {
      context: {
        operationId,
        cursor,
        sending: false,
      } satisfies OperationPeerContext,
    };
  },
  open(peer) {
    const context = peer.context as unknown as OperationPeerContext;
    const sendAvailable = async () => {
      if (context.sending) {
        return;
      }
      context.sending = true;
      try {
        const events = await getApplicationServices().operations.eventsAfter(
          context.operationId,
          context.cursor,
        );
        if (events.length > 0) {
          context.cursor = events.at(-1)?.sequence ?? context.cursor;
          peer.send({ type: 'operation.events', events, cursor: context.cursor });
        }
      } finally {
        context.sending = false;
      }
    };
    void sendAvailable();
    context.polling = setInterval(() => void sendAvailable(), 250);
  },
  close(peer) {
    const context = peer.context as unknown as OperationPeerContext;
    if (context.polling !== undefined) {
      clearInterval(context.polling);
    }
  },
  error(peer) {
    const context = peer.context as unknown as OperationPeerContext;
    if (context.polling !== undefined) {
      clearInterval(context.polling);
    }
  },
});

