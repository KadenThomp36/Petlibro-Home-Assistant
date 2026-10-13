import type {
  WorkerHealth,
  WorkerInvocationSnapshot,
} from '#/infrastructure/worker/worker-contract';

export interface StateAgentInspectionCapabilityRequest {
  readonly invocationId: string;
  readonly operationId: string;
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutSeconds: number;
}

export interface CapabilityProvider {
  health(): Promise<WorkerHealth>;
  submitStateAgentInspection(
    request: StateAgentInspectionCapabilityRequest,
  ): Promise<WorkerInvocationSnapshot>;
  getInvocation(invocationId: string): Promise<WorkerInvocationSnapshot>;
}

export class WorkerUnavailableError extends Error {
  public constructor(message = 'The device-operations worker is unavailable.') {
    super(message);
    this.name = 'WorkerUnavailableError';
  }
}

export class WorkerProtocolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'WorkerProtocolError';
  }
}

export class WorkerInvocationNotFoundError extends Error {
  public constructor() {
    super('The worker no longer knows this capability invocation.');
    this.name = 'WorkerInvocationNotFoundError';
  }
}

export class WorkerRejectedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'WorkerRejectedError';
  }
}
