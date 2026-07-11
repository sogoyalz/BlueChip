import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../config";
import { SymbolInfo, TickerPrice } from "../types";

// One shared poll of the backend's Gemini price cache feeds every component
// (watchlist, top bar, trade modal, charts). 5s keeps the UI feeling live
// without hammering the backend; upgrading this file to SSE/WebSocket later
// touches nothing else.

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

    axios
      .get<SymbolInfo[]>(`${API_URL}/api/symbols`)
      .then((res) => {
        if (!cancelled) setSymbols(res.data);
      })
      .catch((err) => console.error("Failed to load symbols:", err));

    const fetchPrices = () => {
      axios
        .get<{ prices: Record<string, TickerPrice> }>(`${API_URL}/api/prices`)
        .then((res) => {
          if (cancelled) return;
          lastSuccess.current = Date.now();
          setPrices(res.data.prices);
          setIsStale(Object.keys(res.data.prices).length === 0);
        })
        .catch(() => {
          if (cancelled) return;
          if (Date.now() - lastSuccess.current > STALE_AFTER_MS) setIsStale(true);
        });
    };

    fetchPrices();
    const timer = setInterval(fetchPrices, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <PricesContext.Provider value={{ prices, symbols, isStale }}>
      {children}
    </PricesContext.Provider>
  );
};

export default PricesContext;
