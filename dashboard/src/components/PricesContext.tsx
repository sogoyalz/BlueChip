import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../config";
import { SymbolInfo, TickerPrice } from "../types";

// One shared feed of the backend's Gemini price cache drives every
// component (watchlist, top bar, trade modal, charts). Prices arrive over
// Server-Sent Events — streaming end to end: Gemini WebSocket -> backend
// cache -> SSE -> here. If the stream can't connect (old proxy, backend
// mid-restart), we quietly fall back to polling /api/prices.

const POLL_MS = 5000;
// If we haven't heard from the backend in this long, flag prices as stale.
const STALE_AFTER_MS = 15000;

interface PricesContextValue {
  prices: Record<string, TickerPrice>;
  symbols: SymbolInfo[];
  isStale: boolean;
}

const PricesContext = createContext<PricesContextValue>({
  prices: {},
  symbols: [],
  isStale: true,
});

export const usePrices = () => useContext(PricesContext);

export const PricesProvider = ({ children }: { children: React.ReactNode }) => {
  const [prices, setPrices] = useState<Record<string, TickerPrice>>({});
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [isStale, setIsStale] = useState(true);
  const lastSuccess = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    axios
      .get<SymbolInfo[]>(`${API_URL}/api/symbols`)
      .then((res) => {
        if (!cancelled) setSymbols(res.data);
      })
      .catch((err) => console.error("Failed to load symbols:", err));

    const apply = (next: Record<string, TickerPrice>) => {
      if (cancelled) return;
      lastSuccess.current = Date.now();
      setPrices(next);
      setIsStale(Object.keys(next).length === 0);
    };

    const fetchPrices = () => {
      axios
        .get<{ prices: Record<string, TickerPrice> }>(`${API_URL}/api/prices`)
        .then((res) => apply(res.data.prices))
        .catch(() => {
          if (cancelled) return;
          if (Date.now() - lastSuccess.current > STALE_AFTER_MS) setIsStale(true);
        });
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      fetchPrices();
      pollTimer = setInterval(fetchPrices, POLL_MS);
    };

    // Prefer the SSE stream; EventSource reconnects on its own, but if the
    // stream errors before ever delivering data we fall back to polling.
    if (typeof EventSource !== "undefined") {
      try {
        es = new EventSource(`${API_URL}/api/stream`);
        es.addEventListener("prices", (e) => {
          try {
            apply(JSON.parse((e as MessageEvent).data).prices);
          } catch {
            // malformed frame — ignore, next one is 2s away
          }
        });
        es.onerror = () => {
          if (lastSuccess.current === 0) {
            es?.close();
            es = null;
            startPolling();
          }
          // else: EventSource retries by itself; keep the last good prices
        };
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  return (
    <PricesContext.Provider value={{ prices, symbols, isStale }}>
      {children}
    </PricesContext.Provider>
  );
};

export default PricesContext;
