import type {
  CameraProjection,
  ControllerProjection,
  DeviceOverviewSnapshot,
  DeviceProjection,
  RuntimeAvailability,
  RuntimeObservationMetadata,
  RuntimeServiceObservation,
} from '#/domain/device-overview';
import type { MqttBrokerAdapter } from '#/infrastructure/observations/mqtt-broker-adapter';
import type {
  CameraStatus,
  ControllerStatus,
  DeviceRegistryStatus,
  FileObservation,
  RegistryDevice,
  RuntimeFileAdapter,
  RuntimeOptions,
} from '#/infrastructure/observations/runtime-file-adapter';

const CONTROLLER_FRESH_MS = 90_000;
const DISCOVERY_FRESH_MS = 75_000;
const CAMERA_ACTIVE_FRESH_MS = 90_000;

export class DeviceOverviewService {
  public constructor(
    private readonly files: RuntimeFileAdapter,
    private readonly broker: MqttBrokerAdapter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async getSnapshot(): Promise<DeviceOverviewSnapshot> {
    const generatedAt = this.clock().toISOString();
    const [options, registry] = await Promise.all([
      this.files.options(),
      this.files.registry(),
    ]);
    const devices =
      registry.kind === 'available'
        ? await Promise.all(
            registry.value.devices.map((device) =>
              this.projectDevice(device, generatedAt),
            ),
          )
        : [];
    const services = await this.projectServices(
      options,
      registry,
      devices,
      generatedAt,
    );
    return {
      apiVersion: 'v1',
      generatedAt,
      services,
      devices,
      warnings: [
        ...fileWarnings('Supervisor options', options),
        ...fileWarnings('AppDaemon discovery registry', registry),
        ...devices.flatMap((device) => device.warnings),
      ],
    };
  }

  private async projectDevice(
    device: RegistryDevice,
    collectedAt: string,
  ): Promise<DeviceProjection> {
    const [controllerResult, cameraResult] = await Promise.all([
      this.files.controller(device.product, device.serial),
      device.streamName === null
        ? Promise.resolve({ kind: 'missing' } as const)
        : this.files.camera(device.streamName),
    ]);
    const controller = this.controllerProjection(controllerResult, collectedAt);
    const camera = this.cameraProjection(
      cameraResult,
      device.streamName,
      collectedAt,
    );
    const warnings: string[] = [];
    if (controllerResult.kind === 'missing') {
      warnings.push(
        `${device.serial}: AppDaemon has not published controller status.`,
      );
    } else if (controllerResult.kind === 'invalid') {
      warnings.push(`${device.serial}: ${controllerResult.detail}`);
    }
    if (controller?.observation.freshness === 'stale') {
      warnings.push(`${device.serial}: AppDaemon controller status is stale.`);
    }
    if (device.ready.stream_configured && cameraResult.kind === 'invalid') {
      warnings.push(`${device.serial}: ${cameraResult.detail}`);
    }
    if (camera?.observation.freshness === 'stale') {
      warnings.push(`${device.serial}: active camera status is stale.`);
    }
    const observedAt = device.lastMqttSeen ?? device.lastIpResolved;
    return {
      id: `${device.product}/${device.serial}`,
      product: device.product,
      serial: device.serial,
      uidDisplay: maskUid(device.uid),
      ipAddress: device.ipAddress,
      configured: device.manualOverride,
      availability: deviceAvailability(controller),
      lastMqttSeen: device.lastMqttSeen,
      streamName: device.streamName,
      readiness: device.ready,
      controller,
      camera,
      warnings,
      observation: metadata({
        source: 'appdaemon-registry',
        authority: 'appdaemon',
        collectedAt,
        observedAt,
        freshness: freshness(observedAt, DISCOVERY_FRESH_MS, this.clock()),
        verification: 'service-reported',
        scope:
          'AppDaemon discovery identity and address observations; discovery is not proof of feeder health.',
      }),
    };
  }

  private controllerProjection(
    result: FileObservation<ControllerStatus>,
    collectedAt: string,
  ): ControllerProjection | null {
    if (result.kind !== 'available') return null;
    const value = result.value;
    const observedFreshness = freshness(
      value.lastUpdate,
      CONTROLLER_FRESH_MS,
      this.clock(),
    );
    let availability: RuntimeAvailability = 'degraded';
    if (observedFreshness === 'stale') availability = 'stale';
    else if (value.lifecycle !== 'running') availability = 'unavailable';
    else if (
      value.reconciliationState === 'READY' &&
      value.feederMqttConnected &&
      value.stateAgentHealthy
    )
      availability = 'ready';
    else if (value.reconciliationState === 'DIVERGED')
      availability = 'unhealthy';
    return {
      availability,
      reconciliationState: value.reconciliationState,
      feederMqttConnected: value.feederMqttConnected,
      stateAgentHealthy: value.stateAgentHealthy,
      writesReady: value.writesReady,
      writePending: value.writePending,
      lastFeederActivityAt: value.lastFeederActivityAt,
      lastHomeAssistantBirthAt: value.lastHomeAssistantBirthAt,
      verifiedState: value.verifiedState,
      observation: metadata({
        source: 'appdaemon-controller',
        authority: 'appdaemon',
        collectedAt,
        observedAt: value.lastUpdate,
        freshness: observedFreshness,
        verification: value.verifiedState
          ? 'state-agent-verified'
          : 'service-reported',
        scope:
          'Controller-owned MQTT, reconciliation, and State Agent verification state; no management write authority.',
      }),
    };
  }

  private cameraProjection(
    result: FileObservation<CameraStatus>,
    streamName: string | null,
    collectedAt: string,
  ): CameraProjection | null {
    if (streamName === null) return null;
    if (result.kind !== 'available') {
      return {
        availability: result.kind === 'invalid' ? 'unhealthy' : 'unknown',
        configured: true,
        streamName,
        status: null,
        requestedQuality: null,
        resolution: null,
        health: null,
        observation: metadata({
          source: 'go2rtc-runtime',
          authority: 'go2rtc',
          collectedAt,
          observedAt: null,
          freshness: 'unknown',
          verification: 'configured',
          scope:
            result.kind === 'invalid'
              ? result.detail
              : 'Stream is configured, but no physical camera session status has been emitted yet.',
        }),
      };
    }
    const value = result.value;
    const active = ['starting', 'probing', 'online'].includes(value.status);
    const observedFreshness = active
      ? freshness(value.lastUpdate, CAMERA_ACTIVE_FRESH_MS, this.clock())
      : 'historical';
    const availability: RuntimeAvailability =
      observedFreshness === 'stale'
        ? 'stale'
        : value.status === 'online'
          ? 'ready'
          : value.status === 'error'
            ? 'unhealthy'
            : value.status === 'starting' || value.status === 'probing'
              ? 'degraded'
              : 'unknown';
    return {
      availability,
      configured: true,
      streamName,
      status: value.status,
      requestedQuality: value.requestedQuality,
      resolution: value.actualResolution,
      health: value.health,
      observation: metadata({
        source: 'go2rtc-runtime',
        authority: 'go2rtc',
        collectedAt,
        observedAt: value.lastUpdate,
        freshness: observedFreshness,
        verification: 'service-reported',
        scope:
          'go2rtc physical-session status only; an idle or absent session does not prove service failure.',
      }),
    };
  }

  private async projectServices(
    options: FileObservation<RuntimeOptions>,
    registry: FileObservation<DeviceRegistryStatus>,
    devices: readonly DeviceProjection[],
    collectedAt: string,
  ): Promise<readonly RuntimeServiceObservation[]> {
    const broker =
      options.kind === 'available'
        ? await this.broker.observe({
            host: options.value.mqttHost,
            port: options.value.mqttPort,
            username: options.value.mqttUsername,
            password: options.value.mqttPassword,
          })
        : null;
    return [
      supervisorService(options, collectedAt),
      appDaemonService(registry, devices, collectedAt, this.clock()),
      go2rtcService(devices, collectedAt),
      brokerService(broker, options, collectedAt),
      homeAssistantService(devices, collectedAt),
    ];
  }
}

function supervisorService(
  options: FileObservation<RuntimeOptions>,
  collectedAt: string,
): RuntimeServiceObservation {
  const ready = options.kind === 'available';
  return service(
    'supervisor',
    'Add-on configuration',
    ready
      ? 'ready'
      : options.kind === 'invalid'
        ? 'unhealthy'
        : 'not-configured',
    ready
      ? 'Supervisor-owned add-on options were read successfully.'
      : options.kind === 'invalid'
        ? options.detail
        : 'Supervisor options are not available in this runtime.',
    metadata({
      source: 'supervisor-options',
      authority: 'home-assistant-supervisor',
      collectedAt,
      observedAt: ready ? collectedAt : null,
      freshness: ready ? 'fresh' : 'unknown',
      verification: 'configured',
      scope:
        'Read-only effective add-on configuration. Supervisor service control/API access is not granted.',
    }),
  );
}

function appDaemonService(
  registry: FileObservation<DeviceRegistryStatus>,
  devices: readonly DeviceProjection[],
  collectedAt: string,
  now: Date,
): RuntimeServiceObservation {
  if (registry.kind !== 'available') {
    return service(
      'appdaemon',
      'Routine controller',
      registry.kind === 'invalid' ? 'unhealthy' : 'unavailable',
      registry.kind === 'invalid'
        ? registry.detail
        : 'The AppDaemon discovery heartbeat is unavailable.',
      metadata({
        source: 'appdaemon-registry',
        authority: 'appdaemon',
        collectedAt,
        observedAt: null,
        freshness: 'unknown',
        verification: 'service-reported',
        scope: 'AppDaemon discovery and per-device controller observations.',
      }),
    );
  }
  const heartbeatFreshness = freshness(
    registry.value.lastUpdate,
    DISCOVERY_FRESH_MS,
    now,
  );
  const unavailableController = devices.some(
    (device) =>
      device.controller === null ||
      ['unhealthy', 'stale', 'unavailable'].includes(
        device.controller.availability,
      ),
  );
  const availability: RuntimeAvailability =
    heartbeatFreshness === 'stale'
      ? 'stale'
      : heartbeatFreshness === 'unknown'
        ? 'unknown'
        : unavailableController
          ? 'degraded'
          : 'ready';
  return service(
    'appdaemon',
    'Routine controller',
    availability,
    devices.length === 0
      ? 'AppDaemon discovery is active; no feeder has been discovered or configured.'
      : `${devices.length} feeder controller projection${devices.length === 1 ? '' : 's'} correlated.`,
    metadata({
      source: 'appdaemon-registry',
      authority: 'appdaemon',
      collectedAt,
      observedAt: registry.value.lastUpdate,
      freshness: heartbeatFreshness,
      verification: 'service-reported',
      scope:
        'AppDaemon process/discovery heartbeat and controller-owned status files.',
    }),
  );
}

function go2rtcService(
  devices: readonly DeviceProjection[],
  collectedAt: string,
): RuntimeServiceObservation {
  const cameras = devices.flatMap((device) => device.camera ?? []);
  const available = cameras.filter((camera) => camera.status !== null);
  const unhealthy = cameras.some((camera) =>
    ['unhealthy', 'stale'].includes(camera.availability),
  );
  return service(
    'go2rtc',
    'Camera runtime',
    cameras.length === 0
      ? 'not-configured'
      : unhealthy
        ? 'degraded'
        : available.length > 0
          ? 'ready'
          : 'unknown',
    cameras.length === 0
      ? 'No camera stream is configured.'
      : available.length === 0
        ? 'Streams are configured; no physical camera session status exists yet.'
        : `${available.length} go2rtc physical-session observation${available.length === 1 ? '' : 's'} available.`,
    metadata({
      source: 'go2rtc-runtime',
      authority: 'go2rtc',
      collectedAt,
      observedAt: available[0]?.observation.observedAt ?? null,
      freshness: available[0]?.observation.freshness ?? 'unknown',
      verification: available.length > 0 ? 'service-reported' : 'configured',
      scope:
        'Configured streams and go2rtc-owned physical camera session status.',
    }),
  );
}

function brokerService(
  broker: Awaited<ReturnType<MqttBrokerAdapter['observe']>> | null,
  options: FileObservation<RuntimeOptions>,
  collectedAt: string,
): RuntimeServiceObservation {
  if (broker === null) {
    return service(
      'mosquitto',
      'MQTT broker',
      'not-configured',
      'A broker probe cannot run without valid add-on MQTT configuration.',
      metadata({
        source: 'supervisor-options',
        authority: 'home-assistant-supervisor',
        collectedAt,
        observedAt: null,
        freshness: 'unknown',
        verification: 'configured',
        scope: 'Broker endpoint configuration only.',
      }),
    );
  }
  const endpoint =
    options.kind === 'available'
      ? `${options.value.mqttHost}:${options.value.mqttPort}`
      : 'configured broker';
  const availability: RuntimeAvailability =
    broker.kind === 'authenticated'
      ? 'ready'
      : broker.kind === 'unreachable'
        ? 'unavailable'
        : 'unhealthy';
  const detail =
    broker.kind === 'authenticated'
      ? `MQTT CONNECT authentication succeeded at ${endpoint}.`
      : broker.kind === 'rejected'
        ? broker.reason
        : broker.kind === 'unreachable'
          ? `The MQTT listener at ${endpoint} could not be reached.`
          : 'The MQTT listener returned an invalid CONNACK response.';
  return service(
    'mosquitto',
    'MQTT broker',
    availability,
    detail,
    metadata({
      source: 'mqtt-broker',
      authority: 'mosquitto',
      collectedAt,
      observedAt: broker.observedAt,
      freshness: 'fresh',
      verification:
        broker.kind === 'authenticated' ? 'authenticated' : 'reachable',
      scope:
        'Bounded MQTT CONNECT/CONNACK probe; no subscription or publication is performed.',
    }),
  );
}

function homeAssistantService(
  devices: readonly DeviceProjection[],
  collectedAt: string,
): RuntimeServiceObservation {
  const observedAt =
    devices
      .map((device) => device.controller?.lastHomeAssistantBirthAt ?? null)
      .find((value) => value !== null) ?? null;
  return service(
    'home-assistant',
    'Home Assistant',
    'unknown',
    observedAt === null
      ? 'No Home Assistant birth event has been projected by a feeder controller.'
      : `AppDaemon observed a Home Assistant birth event at ${observedAt}; current service health is not exposed.`,
    metadata({
      source: 'appdaemon-controller',
      authority: 'appdaemon',
      collectedAt,
      observedAt,
      freshness: observedAt === null ? 'unknown' : 'historical',
      verification: 'service-reported',
      scope:
        'No Supervisor or Home Assistant API permission is requested by this add-on.',
    }),
  );
}

function deviceAvailability(
  controller: ControllerProjection | null,
): RuntimeAvailability {
  return controller?.availability ?? 'unknown';
}

function freshness(
  observedAt: string | null,
  maximumAgeMs: number,
  now: Date,
): 'fresh' | 'stale' | 'unknown' {
  if (observedAt === null) return 'unknown';
  const age = now.getTime() - Date.parse(observedAt);
  return age >= 0 && age <= maximumAgeMs ? 'fresh' : 'stale';
}

function maskUid(uid: string | null): string | null {
  if (uid === null) return null;
  return uid.length <= 8 ? '••••' : `${uid.slice(0, 4)}••••${uid.slice(-4)}`;
}

function fileWarnings<T>(
  name: string,
  observation: FileObservation<T>,
): readonly string[] {
  if (observation.kind === 'invalid') return [`${name}: ${observation.detail}`];
  return [];
}

function service(
  id: RuntimeServiceObservation['id'],
  name: string,
  availability: RuntimeAvailability,
  detail: string,
  observation: RuntimeObservationMetadata,
): RuntimeServiceObservation {
  return { id, name, availability, detail, observation };
}

function metadata(
  value: RuntimeObservationMetadata,
): RuntimeObservationMetadata {
  return value;
}
