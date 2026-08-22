export type LabProcessStatus =
  | "running"
  | "success"
  | "error";

export type LabProcess = {
  id: string;
  label: string;
  detail?: string;
  origin?: string;
  purpose?: string;
  subject?: string;
  kind?: "single" | "batch";
  status: LabProcessStatus;
  current?: number;
  total?: number;
  startedAt: string;
  updatedAt?: string;
  finishedAt?: string;
};

export type StartProcessInput = {
  id: string;
  label: string;
  detail?: string;
  origin?: string;
  purpose?: string;
  subject?: string;
  kind?: "single" | "batch";
  current?: number;
  total?: number;
};
