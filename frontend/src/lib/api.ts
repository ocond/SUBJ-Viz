import { useEffect, useRef, useState } from "react";

export class ApiError extends Error {}

function describeError(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: { msg?: string; loc?: unknown[] }) =>
        [item.loc?.slice(1).join("."), item.msg].filter(Boolean).join(": "),
      )
      .join("; ");
  }
  return `Request failed with status ${status}`;
}

export async function requestJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(describeError(response.status, json));
  return json as T;
}

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  pending: boolean;
}

/**
 * Posts `request` to `path` whenever it changes. At most one request is in flight: while
 * dragging, intermediate states are skipped and only the latest one is sent next, so the
 * views follow the pointer without queueing up requests.
 */
export function useApi<T>(path: string, request: unknown | null): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, pending: false });
  const key = request === null ? null : JSON.stringify(request);
  const latest = useRef<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    latest.current = key;
    if (key === null || inFlight.current) return;

    const send = (payload: string) => {
      inFlight.current = true;
      setState((s) => ({ ...s, pending: true }));
      requestJson<T>(path, JSON.parse(payload))
        .then((data) => {
          if (mounted.current && payload === latest.current) setState({ data, error: null, pending: false });
          else if (mounted.current) setState((s) => ({ ...s, data, error: null }));
        })
        .catch((error: unknown) => {
          if (mounted.current) {
            const message = error instanceof Error ? error.message : String(error);
            setState((s) => ({ ...s, error: message, pending: false }));
          }
        })
        .finally(() => {
          inFlight.current = false;
          if (mounted.current && latest.current !== null && latest.current !== payload) send(latest.current);
        });
    };
    send(key);
  }, [path, key]);

  return state;
}
