import {
  parseSystemStatusSnapshot,
  type SystemStatusSnapshot,
} from '#/domain/system-status';

export async function fetchSystemStatus(
  signal?: AbortSignal,
): Promise<SystemStatusSnapshot> {
  const request: RequestInit = {
    headers: { Accept: 'application/json' },
  };
  if (signal !== undefined) {
    request.signal = signal;
  }

  const response = await fetch(
    `${import.meta.env.BASE_URL}api/v1/system/status`,
    request,
  );

  if (!response.ok) {
    throw new Error(`Management API request failed (${response.status}).`);
  }

  return parseSystemStatusSnapshot(await response.json());
}
