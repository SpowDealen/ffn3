import type {CreateEditorialEntityExecutor} from "./types";
let executor: CreateEditorialEntityExecutor | undefined;
export function registerEntityCreationExecutor(next: CreateEditorialEntityExecutor, options: {replace?: boolean} = {}): () => void { const previous = executor; if (executor && executor !== next && !options.replace) throw new Error("entity_creation_executor_already_registered"); executor = next; return () => { if (executor === next) executor = previous; }; }
export const getEntityCreationExecutor = (): CreateEditorialEntityExecutor | undefined => executor;
