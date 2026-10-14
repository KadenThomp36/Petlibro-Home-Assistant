import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { mqttConnectProbe } from './mqtt-broker-adapter';

let server: Server | undefined;

afterEach(async () => {
  if (server === undefined) return;
  const current = server;
  server = undefined;
  await new Promise<void>((resolve, reject) => {
    current.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('mqttConnectProbe', () => {
  it('reports authenticated only after a successful MQTT CONNACK', async () => {
    let request = Buffer.alloc(0);
    const port = await listen((socket) => {
      socket.once('data', (data) => {
        request = data;
        socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00]));
      });
    });

    const result = await mqttConnectProbe({
      host: '127.0.0.1',
      port,
      username: 'example-user',
      password: 'example-password',
      timeoutMs: 1_000,
    });

    expect(result.kind).toBe('authenticated');
    expect(request[0]).toBe(0x10);
    expect(request.includes(Buffer.from('MQTT'))).toBe(true);
    expect(request.includes(Buffer.from('example-user'))).toBe(true);
    expect(request.includes(Buffer.from('example-password'))).toBe(true);
  });

  it('separates broker authentication rejection from reachability', async () => {
    const port = await listen((socket) => {
      socket.once('data', () => {
        socket.write(Buffer.from([0x20, 0x02, 0x00, 0x04]));
      });
    });

    const result = await mqttConnectProbe({
      host: '127.0.0.1',
      port,
      username: 'rejected-user',
      password: 'rejected-password',
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({
      kind: 'rejected',
      reason: 'The broker rejected the configured credentials.',
    });
  });
});

async function listen(connection: (socket: Socket) => void): Promise<number> {
  server = createServer(connection);
  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject);
    server?.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Synthetic MQTT listener did not bind to TCP.');
  }
  return address.port;
}
