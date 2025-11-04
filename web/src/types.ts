// shared types used in the client
export type StepJSON = Record<string, unknown>;

export interface PostStepsPayload {
  version: number;
  clientId: string;
  steps: StepJSON[];
}

export interface StepsResponse {
  version: number;
  steps: StepJSON[];
}
