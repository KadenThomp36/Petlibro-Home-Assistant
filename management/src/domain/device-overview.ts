export type RuntimeAvailability =
  | 'ready'
  | 'degraded'
  | 'unhealthy'
  | 'unknown'
  | 'stale'
  | 'unavailable'
  | 'not-configured';

export type ObservationFreshness = 'fresh' | 'stale' | 'historical' | 'unknown';

export type ObservationVerification =
  | 'configured'
  | 'reachable'
  | 'authenticated'
  | 'service-reported'
  | 'state-agent-verified';

export interface RuntimeObservationMetadata {
  readonly source:
    | 'supervisor-options'
    | 'appdaemon-registry'
    | 'appdaemon-controller'
    | 'go2rtc-runtime'
    | 'mqtt-broker';
  readonly authority:
    | 'home-assistant-supervisor'
    | 'appdaemon'
    | 'go2rtc'
    | 'mosquitto';
  readonly collectedAt: string;
  readonly observedAt: string | null;
  readonly freshness: ObservationFreshness;
  readonly verification: ObservationVerification;
  readonly scope: string;
}

export interface RuntimeServiceObservation {
  readonly id:
    | 'appdaemon'
    | 'go2rtc'
    | 'mosquitto'
    | 'home-assistant'
    | 'supervisor';
  readonly name: string;
  readonly availability: RuntimeAvailability;
  readonly detail: string;
  readonly observation: RuntimeObservationMetadata;
}

export interface VerifiedDeviceState {
  readonly verifiedAt: string;
  readonly revisions: Readonly<Record<string, string>>;
  readonly planCount: number;
  readonly queuePending: boolean;
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface ControllerProjection {
  readonly availability: RuntimeAvailability;
  readonly reconciliationState: string;
  readonly feederMqttConnected: boolean;
  readonly stateAgentHealthy: boolean;
  readonly writesReady: boolean;
  readonly writePending: boolean;
  readonly lastFeederActivityAt: string | null;
  readonly lastHomeAssistantBirthAt: string | null;
  readonly verifiedState: VerifiedDeviceState | null;
  readonly observation: RuntimeObservationMetadata;
}

export interface CameraProjection {
  readonly availability: RuntimeAvailability;
  readonly configured: boolean;
  readonly streamName: string | null;
  readonly status: string | null;
  readonly requestedQuality: string | null;
  readonly resolution: {
    readonly width: number;
    readonly height: number;
  } | null;
  readonly health: Readonly<Record<string, number | null>> | null;
  readonly observation: RuntimeObservationMetadata;
}

export interface DeviceProjection {
  readonly id: string;
  readonly product: string;
  readonly serial: string;
  readonly uidDisplay: string | null;
  readonly ipAddress: string | null;
  readonly configured: boolean;
  readonly availability: RuntimeAvailability;
  readonly lastMqttSeen: string | null;
  readonly streamName: string | null;
  readonly readiness: Readonly<Record<string, boolean>>;
  readonly controller: ControllerProjection | null;
  readonly camera: CameraProjection | null;
  readonly warnings: readonly string[];
  readonly observation: RuntimeObservationMetadata;
}

export interface DeviceOverviewSnapshot {
  readonly apiVersion: 'v1';
  readonly generatedAt: string;
  readonly services: readonly RuntimeServiceObservation[];
  readonly devices: readonly DeviceProjection[];
  readonly warnings: readonly string[];
}

export function parseDeviceOverviewSnapshot(
  value: unknown,
): DeviceOverviewSnapshot {
  if (
    !isRecord(value) ||
    value.apiVersion !== 'v1' ||
    typeof value.generatedAt !== 'string' ||
    !Array.isArray(value.services) ||
    !value.services.every(isServiceObservation) ||
    !Array.isArray(value.devices) ||
    !value.devices.every(isDeviceProjection) ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) => typeof warning === 'string')
  ) {
    throw new Error('The management API returned an invalid device overview.');
  }
  return value as unknown as DeviceOverviewSnapshot;
}

const AVAILABILITY = new Set<RuntimeAvailability>([
  'ready',
  'degraded',
  'unhealthy',
  'unknown',
  'stale',
  'unavailable',
  'not-configured',
]);

function isServiceObservation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    AVAILABILITY.has(value.availability as RuntimeAvailability) &&
    typeof value.detail === 'string' &&
    isObservation(value.observation)
  );
}

function isDeviceProjection(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.product === 'string' &&
    typeof value.serial === 'string' &&
    optionalString(value.uidDisplay) &&
    optionalString(value.ipAddress) &&
    typeof value.configured === 'boolean' &&
    AVAILABILITY.has(value.availability as RuntimeAvailability) &&
    optionalString(value.lastMqttSeen) &&
    optionalString(value.streamName) &&
    isRecord(value.readiness) &&
    Object.values(value.readiness).every((item) => typeof item === 'boolean') &&
    (value.controller === null || isController(value.controller)) &&
    (value.camera === null || isCamera(value.camera)) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === 'string') &&
    isObservation(value.observation)
  );
}

function isController(value: unknown): boolean {
  return (
    isRecord(value) &&
    AVAILABILITY.has(value.availability as RuntimeAvailability) &&
    typeof value.reconciliationState === 'string' &&
    typeof value.feederMqttConnected === 'boolean' &&
    typeof value.stateAgentHealthy === 'boolean' &&
    typeof value.writesReady === 'boolean' &&
    typeof value.writePending === 'boolean' &&
    optionalString(value.lastFeederActivityAt) &&
    optionalString(value.lastHomeAssistantBirthAt) &&
    (value.verifiedState === null || isVerifiedState(value.verifiedState)) &&
    isObservation(value.observation)
  );
}

function isVerifiedState(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.verifiedAt === 'string' &&
    isRecord(value.revisions) &&
    Object.values(value.revisions).every(
      (revision) => typeof revision === 'string',
    ) &&
    typeof value.planCount === 'number' &&
    typeof value.queuePending === 'boolean' &&
    isRecord(value.settings)
  );
}

function isCamera(value: unknown): boolean {
  return (
    isRecord(value) &&
    AVAILABILITY.has(value.availability as RuntimeAvailability) &&
    typeof value.configured === 'boolean' &&
    optionalString(value.streamName) &&
    optionalString(value.status) &&
    optionalString(value.requestedQuality) &&
    (value.resolution === null ||
      (isRecord(value.resolution) &&
        typeof value.resolution.width === 'number' &&
        typeof value.resolution.height === 'number')) &&
    (value.health === null || isRecord(value.health)) &&
    isObservation(value.observation)
  );
}

function isObservation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.source === 'string' &&
    typeof value.authority === 'string' &&
    typeof value.collectedAt === 'string' &&
    optionalString(value.observedAt) &&
    ['fresh', 'stale', 'historical', 'unknown'].includes(
      String(value.freshness),
    ) &&
    typeof value.verification === 'string' &&
    typeof value.scope === 'string'
  );
}

function optionalString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
