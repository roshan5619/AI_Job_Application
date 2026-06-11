/**
 * Minimal structured logger. Emits one JSON object per line (friendly to log
 * aggregators) and redacts anything that looks like a secret so tokens/keys
 * never land in logs.
 */
type Level = "info" | "warn" | "error";

const SECRET_KEY = /token|secret|password|api[_-]?key|authorization|cookie/i;

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEY.test(k)) out[k] = "[redacted]";
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else out[k] = v;
  }
  return out;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? redact(meta) : {}),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
};
