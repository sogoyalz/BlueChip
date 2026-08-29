// Process lifecycle: draining cleanly when the platform asks us to stop.

import mongoose from "mongoose";
import { stopGeminiWs } from "./services/geminiWs";
import { stopPolling } from "./services/priceFeed";
import { stopOrderSync } from "./services/orderSync";
import { stopSnapshots } from "./services/snapshots";
import { stopSseBroadcast } from "./services/sse";

// How long to wait for in-flight work before giving up and exiting anyway.
// Render sends SIGTERM and force-kills after its own grace period, so this has
// to be comfortably shorter than that.
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Shut down in the order that avoids losing work.
 *
 * Without this, a deploy's SIGTERM kills the process instantly: an order could
 * be placed on the exchange with its local write still in flight, which is the
 * one state this system cannot reconcile on its own. Stopping the background
 * timers first means no NEW work starts, then the HTTP server drains what is
 * already running, and only then does the database connection close.
 *
 * SSE streams are ended explicitly (see stopSseBroadcast) because an HTTP
 * server will not finish closing while any connection is still open, and these
 * are held open indefinitely by design.
 */
export function installShutdownHandlers(server: { close(cb: (err?: Error) => void): void }): void {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return; // a second signal must not re-enter
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — draining`);

    // Belt and braces: never hang forever holding a deploy open.
    const forceExit = setTimeout(() => {
      console.error("[shutdown] timed out waiting to drain — exiting anyway");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      stopOrderSync();
      stopSnapshots();
      stopPolling();
      stopGeminiWs();
      stopSseBroadcast();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mongoose.disconnect();
      console.log("[shutdown] clean");
      process.exit(0);
    } catch (err) {
      console.error("[shutdown] failed:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

