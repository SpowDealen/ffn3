import type {ReviewJsonValue} from "../../types";

const SENSITIVE = /^(token|secret|password|authorization|cookie|apiKey|privateKey|session|credential|accessKey|refreshToken)$/i;
export function assertSafeSerializable(value: unknown, maxBytes = 200_000, maxStringLength = 20_000, maxDepth = 12): asserts value is ReviewJsonValue {
  const seen = new WeakSet<object>();
  const walk = (item: unknown, depth: number, key = ""): void => {
    if (SENSITIVE.test(key)) throw new Error("sensitive_key_rejected");
    if (depth > maxDepth) throw new Error("maximum_depth_exceeded");
    if (typeof item === "string" && item.length > maxStringLength) throw new Error("string_too_long");
    if (item === null || item === undefined || ["string", "number", "boolean"].includes(typeof item)) return;
    if (["function", "symbol", "bigint"].includes(typeof item)) throw new Error("unsupported_value");
    if (typeof item !== "object" || item instanceof Date || item instanceof Error || item instanceof Map || item instanceof Set) throw new Error("unsupported_instance");
    if (seen.has(item)) throw new Error("circular_reference");
    seen.add(item);
    if (Array.isArray(item)) item.forEach((child) => walk(child, depth + 1));
    else {
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error("unknown_class_instance");
      Object.entries(item).forEach(([childKey, child]) => walk(child, depth + 1, childKey));
    }
    seen.delete(item);
  };
  walk(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > maxBytes) throw new Error("payload_too_large");
}

export function assertSerializedSize(value: unknown, maxBytes: number): void {
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { throw new Error("serialization_failed"); }
  if (new TextEncoder().encode(serialized).length > maxBytes) throw new Error("payload_too_large");
}

export const sanitizeExternalError = (error: unknown): string => error instanceof Error && ["provider_timeout", "cancelled", "payload_too_large", "sensitive_key_rejected"].includes(error.message) ? error.message : "provider_failed_safely";
