import { randomBytes } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';

export type BrokerProbeResult =
  | { readonly kind: 'authenticated'; readonly observedAt: string }
  | {
      readonly kind: 'rejected';
      readonly observedAt: string;
      readonly reason: string;
    }
  | { readonly kind: 'unreachable'; readonly observedAt: string }
  | { readonly kind: 'invalid-response'; readonly observedAt: string };

export interface BrokerProbeOptions {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly timeoutMs: number;
}

export type BrokerProbe = (
  options: BrokerProbeOptions,
) => Promise<BrokerProbeResult>;

export class MqttBrokerAdapter {
  private cached:
    | {
        readonly key: string;
        readonly expiresAt: number;
        readonly result: BrokerProbeResult;
      }
    | undefined;

  public constructor(
    private readonly probe: BrokerProbe = mqttConnectProbe,
    private readonly clock: () => Date = () => new Date(),
    private readonly cacheMilliseconds = 15_000,
  ) {}

  public async observe(
    options: Omit<BrokerProbeOptions, 'timeoutMs'>,
  ): Promise<BrokerProbeResult> {
    const key = `${options.host}:${options.port}:${options.username}`;
    const now = this.clock().getTime();
    if (this.cached?.key === key && this.cached.expiresAt > now) {
      return this.cached.result;
    }
    const result = await this.probe({ ...options, timeoutMs: 2_000 });
    this.cached = { key, expiresAt: now + this.cacheMilliseconds, result };
    return result;
  }
}

export async function mqttConnectProbe(
  options: BrokerProbeOptions,
): Promise<BrokerProbeResult> {
  const observedAt = new Date().toISOString();
  let socket: Socket | undefined;
  try {
    const response = await new Promise<Buffer>((resolve, reject) => {
      socket = createConnection({ host: options.host, port: options.port });
      const chunks: Buffer[] = [];
      let length = 0;
      socket.setTimeout(options.timeoutMs);
      socket.once('connect', () => {
        socket?.write(connectPacket(options.username, options.password));
      });
      socket.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        length += chunk.length;
        if (length >= 4) resolve(Buffer.concat(chunks, length));
      });
      socket.once('timeout', () => reject(new Error('timeout')));
      socket.once('error', reject);
      socket.once('close', () => {
        if (length < 4) reject(new Error('closed'));
      });
    });
    if (
      response[0] !== 0x20 ||
      response[1] !== 0x02 ||
      (response[2] ?? 0) > 1 ||
      (response[3] !== 0 && response[2] !== 0)
    ) {
      return { kind: 'invalid-response', observedAt };
    }
    const returnCode = response[3];
    if (returnCode === 0) return { kind: 'authenticated', observedAt };
    return {
      kind: 'rejected',
      observedAt,
      reason: connackReason(returnCode),
    };
  } catch {
    return { kind: 'unreachable', observedAt };
  } finally {
    socket?.destroy();
  }
}

function connectPacket(username: string, password: string): Buffer {
  const protocol = mqttString('MQTT');
  const clientId = mqttString(
    `petlibro-mgmt-${process.pid}-${randomBytes(4).toString('hex')}`,
  );
  let flags = 0x02;
  const payload = [clientId];
  if (username !== '' || password !== '') {
    flags |= 0x80;
    payload.push(mqttString(username));
  }
  if (password !== '') {
    flags |= 0x40;
    payload.push(mqttString(password));
  }
  const variableHeader = Buffer.concat([
    protocol,
    Buffer.from([0x04, flags, 0x00, 0x0a]),
  ]);
  const body = Buffer.concat([variableHeader, ...payload]);
  return Buffer.concat([
    Buffer.from([0x10, ...remainingLength(body.length)]),
    body,
  ]);
}

function mqttString(value: string): Buffer {
  const encoded = Buffer.from(value, 'utf8');
  if (encoded.length > 65_535) throw new Error('MQTT field is too long.');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(encoded.length);
  return Buffer.concat([length, encoded]);
}

function remainingLength(value: number): number[] {
  const encoded: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    encoded.push(byte);
  } while (remaining > 0);
  return encoded;
}

function connackReason(code: number | undefined): string {
  return (
    {
      1: 'The broker rejected the MQTT protocol version.',
      2: 'The broker rejected the generated client identifier.',
      3: 'The broker reported itself unavailable.',
      4: 'The broker rejected the configured credentials.',
      5: 'The broker denied this client.',
    }[code ?? -1] ?? 'The broker returned an unknown rejection.'
  );
}
