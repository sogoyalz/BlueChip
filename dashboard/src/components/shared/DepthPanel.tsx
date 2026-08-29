import React, { useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "../../config";
import { num, price as fmtPrice } from "./format";

// Top-of-book depth (bids/asks) streamed from Gemini's l2 feed via the
// backend. Renders nothing until the book has data, so a cold backend or
// dropped WebSocket never breaks the page.

type Level = [number, number]; // [price, qty]

interface BookResponse {
  symbol: string;
  bids: Level[];
  asks: Level[];
  updatedAt: number;
}

const POLL_MS = 2500;

const fmtQty = (n: number) => num(n, 4);

/**
 * One side of the book.
 *
 * Module scope, not nested inside DepthPanel: a component declared in the
 * render body is a brand-new component TYPE on every render, so React
 * unmounts and rebuilds the entire subtree instead of updating it — measured
 * as fresh DOM nodes on each of the 2.5s polls.
 */
const Side = ({
  levels,
  kind,
  maxQty,
}: {
  levels: Level[];
  kind: "bid" | "ask";
  maxQty: number;
}) => (
  <div className="depth-side">
    <div className="depth-row depth-head">
      <span>Price</span>
      <span>Qty</span>
    </div>
    {levels.map(([price, qty]) => (
      <div className="depth-row" key={`${kind}-${price}`}>
        <span
          className="depth-bar"
          style={{ width: `${Math.min((qty / maxQty) * 100, 100)}%` }}
          data-kind={kind}
          aria-hidden="true"
        />
        <span className={kind === "bid" ? "depth-price up" : "depth-price down"}>
          {fmtPrice(price)}
        </span>
        <span className="depth-qty">{fmtQty(qty)}</span>
      </div>
    ))}
  </div>
);

const DepthPanel = ({ symbol }: { symbol: string }) => {
  const [book, setBook] = useState<BookResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBook(null);
    const load = () => {
      axios
        .get<BookResponse>(`${API_URL}/api/book/${symbol}`)
        .then((res) => {
          if (!cancelled) setBook(res.data);
        })
        .catch(() => {
          // keep last book; panel stays hidden if we never got one
        });
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol]);

  if (!book || (book.bids.length === 0 && book.asks.length === 0)) return null;

  const bestBid = book.bids[0]?.[0];
  const bestAsk = book.asks[0]?.[0];
  const spread =
    bestBid !== undefined && bestAsk !== undefined ? bestAsk - bestBid : null;

  // Bar widths are relative to the largest resting qty on screen.
  const maxQty = Math.max(
    ...book.bids.map(([, q]) => q),
    ...book.asks.map(([, q]) => q),
    1e-9
  );

  return (
    <div className="panel depth-panel">
      <div className="depth-title-row">
        <p className="chart-label">Order book · live from Gemini</p>
        {spread !== null && (
          <p className="chart-label">
            Spread {fmtPrice(spread)}
          </p>
        )}
      </div>
      <div className="depth-grid">
        <div>
          <p className="depth-side-label up">Bids</p>
          <Side levels={book.bids} kind="bid" maxQty={maxQty} />
        </div>
        <div>
          <p className="depth-side-label down">Asks</p>
          <Side levels={book.asks} kind="ask" maxQty={maxQty} />
        </div>
      </div>
    </div>
  );
};

export default DepthPanel;
