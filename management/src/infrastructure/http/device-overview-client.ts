import {
  type DeviceOverviewSnapshot,
  parseDeviceOverviewSnapshot,
} from '#/domain/device-overview';

export async function fetchDeviceOverview(
  signal?: AbortSignal,
): Promise<DeviceOverviewSnapshot> {
  const request: RequestInit = { headers: { Accept: 'application/json' } };
  if (signal !== undefined) request.signal = signal;
  const response = await fetch(
    `${import.meta.env.BASE_URL}api/v1/devices/overview`,
    request,
  );
  if (!response.ok) {
    throw new Error(`Device overview request failed (${response.status}).`);
  }
  return parseDeviceOverviewSnapshot(await response.json());
}
