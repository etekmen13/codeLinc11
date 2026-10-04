import { useEffect, useState } from "react";
import { problems_of } from "../api";

export interface Fetched<T> {
  data: T | null; // for the current body; null while loading or on error
  // The last data for any body, so controls built from a response (such as
  // the tolerance choices) stay on screen while a new body loads
  latest: T | null;
  loading: boolean;
  problems: string[] | null;
  retry: () => void; // send the same body again
}

interface Settled<T> {
  key: string;
  data: T | null;
  problems: string[] | null;
}

// POSTs `body` with `call` whenever the body changes, and ignores answers to
// bodies that are no longer current. `call` must be a stable function, such
// as one of the fetch_* functions in api.ts.
export function useApi<B, T>(
  call: (body: B) => Promise<T>,
  body: B,
): Fetched<T> {
  const [attempt, set_attempt] = useState(0);
  const json = JSON.stringify(body);
  const key = `${attempt}:${json}`;
  const [settled, set_settled] = useState<Settled<T> | null>(null);
  const [latest, set_latest] = useState<T | null>(null);

  useEffect(() => {
    let current = true;
    call(JSON.parse(json) as B)
      .then((data) => {
        if (!current) return;
        set_settled({ key, data, problems: null });
        set_latest(data);
      })
      .catch((err: unknown) => {
        if (current)
          set_settled({ key, data: null, problems: problems_of(err) });
      });
    return () => {
      current = false;
    };
  }, [call, json, key]);

  const done = settled?.key === key ? settled : null;
  return {
    data: done?.data ?? null,
    latest,
    loading: done === null,
    problems: done?.problems ?? null,
    retry: () => set_attempt((n) => n + 1),
  };
}
