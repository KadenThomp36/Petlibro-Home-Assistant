import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type BrokerProbeResult,
  MqttBrokerAdapter,
} from '#/infrastructure/observations/mqtt-broker-adapter';
import { RuntimeFileAdapter } from '#/infrastructure/observations/runtime-file-adapter';
import { DeviceOverviewService } from './device-overview-service';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe('DeviceOverviewService', () => {
  it('correlates registry identity with verified controller and camera observations', async () => {
    const directory = await runtimeDirectory();
    await writeRuntime(directory, '2026-10-14T11:59:50.000Z');
    const service = createService(directory, {
      kind: 'authenticated',
      observedAt: NOW.toISOString(),
    });

    const snapshot = await service.getSnapshot();
    const device = snapshot.devices[0];
    if (device === undefined) throw new Error('expected correlated device');

    expect(snapshot.devices).toHaveLength(1);
    expect(device).toMatchObject({
      id: 'PLAF203/SERIAL1',
      serial: 'SERIAL1',
      uidDisplay: 'ABCD••••5678',
      availability: 'ready',
      controller: {
        reconciliationState: 'READY',
        feederMqttConnected: true,
        stateAgentHealthy: true,
        verifiedState: { planCount: 2, queuePending: false },
      },
      camera: {
        availability: 'ready',
        status: 'online',
        resolution: { width: 1920, height: 1080 },
      },
    });
    expect(serviceState(snapshot, 'mosquitto')).toBe('ready');
    expect(serviceState(snapshot, 'appdaemon')).toBe('ready');
    expect(device.controller?.observation.verification).toBe(
      'state-agent-verified',
    );
  });

  it('marks active service observations stale without converting cached values to truth', async () => {
    const directory = await runtimeDirectory();
    await writeRuntime(directory, '2026-10-14T11:00:00.000Z');

    const snapshot = await createService(directory, {
      kind: 'authenticated',
      observedAt: NOW.toISOString(),
    }).getSnapshot();
    const device = snapshot.devices[0];
    if (device === undefined) throw new Error('expected correlated device');

    expect(device.availability).toBe('stale');
    expect(device.camera?.availability).toBe('stale');
    expect(serviceState(snapshot, 'appdaemon')).toBe('stale');
    expect(snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('controller status is stale'),
        expect.stringContaining('camera status is stale'),
      ]),
    );
  });

  it('distinguishes missing adapters and an unreachable broker', async () => {
    const directory = await runtimeDirectory();
    await writeJson(directory, 'options.json', options());
    await writeJson(directory, 'devices.json', registry(NOW.toISOString()));

    const snapshot = await createService(directory, {
      kind: 'unreachable',
      observedAt: NOW.toISOString(),
    }).getSnapshot();
    const device = snapshot.devices[0];
    if (device === undefined) throw new Error('expected correlated device');

    expect(device.controller).toBeNull();
    expect(device.camera?.availability).toBe('unknown');
    expect(serviceState(snapshot, 'appdaemon')).toBe('degraded');
    expect(serviceState(snapshot, 'mosquitto')).toBe('unavailable');
    expect(serviceState(snapshot, 'home-assistant')).toBe('unknown');
  });

  it('reports recovery on a later snapshot', async () => {
    const directory = await runtimeDirectory();
    await writeRuntime(directory, NOW.toISOString());
    const results: BrokerProbeResult[] = [
      { kind: 'unreachable', observedAt: NOW.toISOString() },
      { kind: 'authenticated', observedAt: NOW.toISOString() },
    ];
    const broker = new MqttBrokerAdapter(
      async () => {
        const result = results.shift();
        if (result === undefined) throw new Error('unexpected probe');
        return result;
      },
      () => NOW,
      0,
    );
    const service = new DeviceOverviewService(
      new RuntimeFileAdapter(directory),
      broker,
      () => NOW,
    );

    expect(serviceState(await service.getSnapshot(), 'mosquitto')).toBe(
      'unavailable',
    );
    expect(serviceState(await service.getSnapshot(), 'mosquitto')).toBe(
      'ready',
    );
  });
});

function createService(directory: string, result: BrokerProbeResult) {
  return new DeviceOverviewService(
    new RuntimeFileAdapter(directory),
    new MqttBrokerAdapter(
      async () => result,
      () => NOW,
      0,
    ),
    () => NOW,
  );
}

async function runtimeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'petlibro-overview-'));
  directories.push(directory);
  return directory;
}

async function writeRuntime(directory: string, observedAt: string) {
  await writeJson(directory, 'options.json', options());
  await writeJson(directory, 'devices.json', registry(observedAt));
  await writeJson(
    directory,
    'petlibro_controller_status_PLAF203_SERIAL1.json',
    controller(observedAt),
  );
  await writeJson(
    directory,
    'petlibro_camera_status_petlibro_plaf203_serial1.json',
    camera(observedAt),
  );
}

async function writeJson(directory: string, name: string, value: unknown) {
  await writeFile(join(directory, name), JSON.stringify(value));
}

function options() {
  return {
    mqtt_host: 'core-mosquitto',
    mqtt_port: 1883,
    mqtt_username: 'petlibro',
    mqtt_password: 'not-exposed',
    device_discovery: true,
    camera_quality: 'hd',
    publish_camera_metadata: true,
  };
}

function registry(lastUpdate: string) {
  return {
    schema_version: 1,
    last_update: lastUpdate,
    devices: {
      'PLAF203/SERIAL1': {
        product: 'PLAF203',
        serial: 'SERIAL1',
        uid: 'ABCD1234567890125678',
        ip_address: '192.0.2.10',
        stream_name: 'petlibro_plaf203_serial1',
        last_mqtt_seen: lastUpdate,
        last_ip_resolved: lastUpdate,
        ready: {
          mqtt_discovered: true,
          uid_discovered: true,
          ip_resolved: true,
          stream_configured: true,
          camera_online: true,
        },
      },
    },
  };
}

function controller(lastUpdate: string) {
  return {
    schema_version: 1,
    product: 'PLAF203',
    serial: 'SERIAL1',
    lifecycle: 'running',
    reconciliation_state: 'READY',
    feeder_mqtt_connected: true,
    state_agent_healthy: true,
    writes_ready: true,
    write_pending: false,
    last_feeder_activity_at: lastUpdate,
    last_home_assistant_birth_at: lastUpdate,
    last_update: lastUpdate,
    verified_state: {
      verified_at: lastUpdate,
      revisions: {
        core_rev: 'core-1',
        settings_rev: 'settings-1',
        plans_rev: 'plans-1',
        queue_index_rev: 'queue-1',
      },
      plan_count: 2,
      queue_pending: false,
      settings: { camera_switch: 'enabled' },
    },
  };
}

function camera(lastUpdate: string) {
  return {
    schema_version: 2,
    status: 'online',
    requested_quality: 'hd',
    last_update: lastUpdate,
    actual_resolution: { width: 1920, height: 1080 },
    health: {
      gapped_idrs: 0,
      dropped_frames: 1,
      missing_fragments: 0,
      ack_pending: 0,
      extended_media_rejected: 0,
    },
  };
}

function serviceState(
  snapshot: Awaited<ReturnType<DeviceOverviewService['getSnapshot']>>,
  id: string,
) {
  return snapshot.services.find((service) => service.id === id)?.availability;
}
