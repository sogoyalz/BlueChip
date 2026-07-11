// Live order books built from Gemini's l2 market-data feed. The WebSocket
// (services/geminiWs.ts) pushes every change in here; /api/book/:symbol
// serves the top of the book to the dashboard's depth panel.
//
// Gemini's protocol: the first l2_updates after subscribing is a full
// snapshot (it also carries a trades array); every later l2_updates is
// incremental. A change is [side, price, quantity] where quantity is the
// NEW total resting at that price — "0" means the level is gone.

export type BookLevel = [price: number, qty: number];

interface Book {
  bids: Map<number, number>; // price -> resting qty
  asks: Map<number, number>;
  updatedAt: number;
}

const books = new Map<string, Book>();

function getOrCreate(symbol: string): Book {
  const key = symbol.toUpperCase();
  let book = books.get(key);
  if (!book) {
    book = { bids: new Map(), asks: new Map(), updatedAt: 0 };
    books.set(key, book);
  }
  return book;
}

/** Wipe one symbol's book (fresh snapshot incoming after a reconnect). */
export function resetBook(symbol: string): void {
  const book = getOrCreate(symbol);
  book.bids.clear();
  book.asks.clear();
  book.updatedAt = Date.now();
}

/** Apply l2 changes: [["buy"|"sell", price, qty], ...]. */
export function applyChanges(
  symbol: string,
  changes: Array<[string, string | number, string | number]>
): void {
  const book = getOrCreate(symbol);
  for (const [side, rawPrice, rawQty] of changes) {
    const price = Number(rawPrice);
    const qty = Number(rawQty);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || price <= 0) continue;
    const levels = side === "buy" ? book.bids : side === "sell" ? book.asks : null;
    if (!levels) continue;
    if (qty <= 0) levels.delete(price);
    else levels.set(price, qty);
  }
  book.updatedAt = Date.now();
}

export interface Depth {
  bids: BookLevel[]; // best (highest) bid first
  asks: BookLevel[]; // best (lowest) ask first
  updatedAt: number;
}

/** Top `levels` of each side, best price first. */
export function getDepth(symbol: string, levels = 10): Depth {
  const book = books.get(symbol.toUpperCase());
  if (!book) return { bids: [], asks: [], updatedAt: 0 };
  const bids = [...book.bids.entries()].sort((a, b) => b[0] - a[0]).slice(0, levels);
  const asks = [...book.asks.entries()].sort((a, b) => a[0] - b[0]).slice(0, levels);
  return { bids, asks, updatedAt: book.updatedAt };
}

/** Test helper. */
export function clearBooks(): void {
  books.clear();
}
