import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeviceOverviewService } from '#/application/device-overview-service';
import { OperationManager } from '#/application/operation-manager';
import { SystemStatusService } from '#/application/system-status-service';
import { MqttBrokerAdapter } from '#/infrastructure/observations/mqtt-broker-adapter';
import { RuntimeFileAdapter } from '#/infrastructure/observations/runtime-file-adapter';
import { SqliteOperationJournal } from '#/infrastructure/persistence/sqlite-operation-journal';
import { PythonWorkerClient } from '#/infrastructure/worker/python-worker-client';

export interface ApplicationServices {
  readonly systemStatus: SystemStatusService;
  readonly deviceOverview: DeviceOverviewService;
  readonly operations: OperationManager;
}

export function createApplicationServices(
  environment: NodeJS.ProcessEnv = process.env,
): ApplicationServices {
  const dataDirectory = resolve(
    environment.PETLIBRO_MANAGEMENT_DATA_DIR ?? '.data',
  );
  const workerSocket = resolve(
    environment.PETLIBRO_WORKER_SOCKET ?? `${dataDirectory}/worker.sock`,
  );
  const worker = new PythonWorkerClient(workerSocket);
  const runtimeDataDirectory = resolve(
    environment.PETLIBRO_RUNTIME_DATA_DIR ?? '.runtime-data',
  );
  const stateAgentConfiguration = {
    ...(environment.PETLIBRO_STATE_AGENT_URL === undefined
      ? {}
      : { baseUrl: environment.PETLIBRO_STATE_AGENT_URL }),
    ...configuredToken(environment),
    timeoutSeconds: configuredTimeout(
      environment.PETLIBRO_STATE_AGENT_TIMEOUT_SECONDS,
    ),
  };
  return {
    systemStatus: new SystemStatusService(
      environment.PETLIBRO_MANAGEMENT_VERSION ?? '0.1.0-development',
      worker,
    ),
    deviceOverview: new DeviceOverviewService(
      new RuntimeFileAdapter(runtimeDataDirectory),
      new MqttBrokerAdapter(),
    ),
    operations: new OperationManager(
      new SqliteOperationJournal(`${dataDirectory}/management.sqlite`),
      worker,
      stateAgentConfiguration,
    ),
  };
}

function configuredToken(environment: NodeJS.ProcessEnv): { token?: string } {
  if (environment.PETLIBRO_STATE_AGENT_TOKEN !== undefined) {
    return { token: environment.PETLIBRO_STATE_AGENT_TOKEN };
  }
  const tokenFile = environment.PETLIBRO_STATE_AGENT_TOKEN_FILE;
  if (tokenFile === undefined || tokenFile === '') {
    return {};
  }
  try {
    const token = readFileSync(tokenFile, 'utf8');
    return token === '' ? {} : { token };
  } catch {
    return {};
  }
}

let applicationServices: ApplicationServices | undefined;

export function getApplicationServices(): ApplicationServices {
  applicationServices ??= createApplicationServices();
  return applicationServices;
}

function configuredTimeout(value: string | undefined): number {
  if (value === undefined) {
    return 5;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 30) {
    throw new Error(
      'PETLIBRO_STATE_AGENT_TIMEOUT_SECONDS must be between 0.1 and 30.',
    );
  }
  return parsed;
}
