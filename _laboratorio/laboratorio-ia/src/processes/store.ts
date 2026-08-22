import type {
  LabProcess,
  StartProcessInput,
} from "./types";

const listeners = new Set<() => void>();

const processes = new Map<string, LabProcess>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getActiveProcess(): LabProcess | null {
  return [...processes.values()]
    .filter((process) => process.status === "running")
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || left.id.localeCompare(right.id))[0] ?? null;
}

export function getProcesses(): readonly LabProcess[] {
  return Object.freeze([...processes.values()]);
}

export function startProcess(
  input: StartProcessInput,
): void {
  const startedAt = new Date().toISOString();
  processes.set(input.id, {
    id: input.id,
    label: input.label,
    detail: input.detail,
    origin: input.origin,
    purpose: input.purpose,
    subject: input.subject,
    kind: input.kind,
    current: input.current,
    total: input.total,
    status: "running",
    startedAt,
    updatedAt: startedAt,
  });

  emitChange();
}

export function updateProcess(
  id: string,
  update: Partial<
    Pick<
      LabProcess,
      "label" | "detail" | "current" | "total"
    >
  >,
): void {
  const process = processes.get(id);
  if (!process || process.status !== "running") return;

  processes.set(id, {
    ...process,
    ...update,
    updatedAt: new Date().toISOString(),
  });

  emitChange();
}

export function completeProcess(id: string): void {
  const process = processes.get(id);
  if (!process || process.status !== "running") return;
  const finishedAt = new Date().toISOString();

  processes.set(id, {
    ...process,
    status: "success",
    updatedAt: finishedAt,
    finishedAt,
  });

  emitChange();

  window.setTimeout(() => {
    const current = processes.get(id);
    if (current?.status === "success" && current.finishedAt === finishedAt) {
      processes.delete(id);
      emitChange();
    }
  }, 1200);
}

export function failProcess(
  id: string,
  detail?: string,
): void {
  const process = processes.get(id);
  if (!process || process.status !== "running") return;
  const finishedAt = new Date().toISOString();

  processes.set(id, {
    ...process,
    status: "error",
    detail: detail || process.detail,
    updatedAt: finishedAt,
    finishedAt,
  });

  emitChange();

  window.setTimeout(() => {
    const current = processes.get(id);
    if (current?.status === "error" && current.finishedAt === finishedAt) {
      processes.delete(id);
      emitChange();
    }
  }, 2500);
}

export function subscribeToProcess(
  listener: () => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
