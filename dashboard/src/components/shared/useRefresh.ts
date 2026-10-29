import { useEffect, useRef } from "react";

/** Refresh one view without overlapping requests; cancel superseded work. */
export function useRefresh(load: (signal: AbortSignal) => Promise<unknown>, version: string | number, intervalMs = 10_000) {
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      try { await latest.current(controller.signal); }
      catch { /* Views own their visible errors. */ }
      finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => { controller.abort(); clearInterval(timer); };
  }, [version, intervalMs]);
}
