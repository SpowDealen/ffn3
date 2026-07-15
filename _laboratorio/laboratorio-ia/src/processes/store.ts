import type {
  LabProcess,
  StartProcessInput,
} from "./types";

const listeners = new Set<() => void>();

let activeProcess: LabProcess | null = null;

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getActiveProcess(): LabProcess | null {
  return activeProcess;
}

export function startProcess(
  input: StartProcessInput,
): void {
  activeProcess = {
    id: input.id,
    label: input.label,
    detail: input.detail,
    current: input.current,
    total: input.total,
    status: "running",
    startedAt: new Date().toISOString(),
  };

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
  if (!activeProcess || activeProcess.id !== id) return;

  activeProcess = {
    ...activeProcess,
    ...update,
  };

  emitChange();
}

export function completeProcess(id: string): void {
  if (!activeProcess || activeProcess.id !== id) return;

  activeProcess = {
    ...activeProcess,
    status: "success",
  };

  emitChange();

  window.setTimeout(() => {
    if (activeProcess?.id === id) {
      activeProcess = null;
      emitChange();
    }
  }, 1200);
}

export function failProcess(
  id: string,
  detail?: string,
): void {
  if (!activeProcess || activeProcess.id !== id) return;

  activeProcess = {
    ...activeProcess,
    status: "error",
    detail: detail || activeProcess.detail,
  };

  emitChange();

  window.setTimeout(() => {
    if (activeProcess?.id === id) {
      activeProcess = null;
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
