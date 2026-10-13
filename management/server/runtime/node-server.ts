import { NodeRequest, serve } from 'srvx/node';
import wsAdapter from 'crossws/adapters/node';
import type { Hooks } from 'crossws';
import { serverFetch, useNitroApp } from 'nitro/app';

const nitroApp = useNitroApp();
const socketPath = process.env.NITRO_UNIX_SOCKET?.trim();
const parsedPort = Number.parseInt(
  process.env.NITRO_PORT ?? process.env.PORT ?? '',
  10,
);
const port = Number.isNaN(parsedPort) ? 3000 : parsedPort;
const certificate = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const hostname = process.env.NITRO_HOST || process.env.HOST;

const server = serve({
  manual: true,
  fetch: nitroApp.fetch,
  ...(socketPath
    ? { port: 0 }
    : {
        port,
        ...(hostname ? { hostname } : {}),
        ...(certificate && key ? { tls: { cert: certificate, key } } : {}),
      }),
});

if (!server.node?.server) {
  throw new Error('The Nitro Node server was not initialized.');
}
const nodeServer = server.node.server;

const { handleUpgrade } = wsAdapter({
  resolve: async (request) => {
    const response = (await serverFetch(request)) as Response & {
      crossws?: Partial<Hooks>;
    };
    return response.crossws ?? {};
  },
});
nodeServer.on('upgrade', (request, socket, head) => {
  handleUpgrade(
    request,
    socket,
    head,
    // Nitro's Node runtime passes the upgrade transport through srvx even
    // though the currently published srvx declaration omits this property.
    // @ts-expect-error -- runtime-supported upgrade context
    new NodeRequest({ req: request, upgrade: { socket, head } }),
  );
});

if (socketPath) {
  // srvx currently resolves every call to server.serve() as a TCP listener.
  // The initialized Node server still exposes its native listen overload, so
  // use that overload to keep the application backend off the host network.
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      nodeServer.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      nodeServer.off('error', onError);
      resolve();
    };
    nodeServer.once('error', onError);
    nodeServer.once('listening', onListening);
    nodeServer.listen(socketPath);
  });
} else {
  await server.serve();
}

export default {};
