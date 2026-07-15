export type LabProcessStatus =
  | "running"
  | "success"
  | "error";

export type LabProcess = {
  id: string;
  label: string;
  detail?: string;
  status: LabProcessStatus;
  current?: number;
  total?: number;
  startedAt: string;
};

export type StartProcessInput = {
  id: string;
  label: string;
  detail?: string;
  current?: number;
  total?: number;
};
