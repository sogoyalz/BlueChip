// The shared Gemini sandbox account: its holdings and its totals. Every
// signed-in user sees the same figures — there is one account behind them all.

import { Response, Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { getHoldings, getAccountTotals } from "../services/account";
import { GeminiUnavailableError } from "../services/geminiPrivate";
import { log } from "../util/logger";

const router = Router();

/**
 * Absent or rejected exchange credentials is a known, expected state — a fresh
 * clone has no sandbox key — not a server fault. Reporting it as a 500 makes
 * an ordinary setup step indistinguishable from a bug, so it gets its own
 * status and a code the dashboard can recognise.
 */
function respondUnavailable(res: Response, err: GeminiUnavailableError): void {
  res.status(503).json({
    code: "exchange_unavailable",
    reason: err.reason,
    message:
      err.reason === "not_configured"
        ? "The exchange connection is not configured on this server."
        : "The exchange rejected this server's credentials.",
  });
}

router.get("/api/holdings", verifyToken, async (_req, res) => {
  try {
    res.json(await getHoldings());
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      log.warn("account.exchange_unavailable", { route: "holdings", reason: err.reason });
      return respondUnavailable(res, err);
    }
    log.error("account.holdings_failed", { err: err as Error });
    res.status(500).json({ message: "Failed to fetch holdings" });
  }
});

router.get("/api/account", verifyToken, async (req, res) => {
  try {
    const user = req.user!;
    const { balance, portfolioValue, complete } = await getAccountTotals();
    res.json({
      username: user.username,
      email: user.email,
      balance,
      portfolioValue,
      // False when a holding could not be priced, so portfolioValue omits it.
      // The dashboard renders "—" rather than a total it knows is short.
      portfolioValueComplete: complete,
      createdAt: user.createdAt,
    });
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      log.warn("account.exchange_unavailable", { route: "account", reason: err.reason });
      return respondUnavailable(res, err);
    }
    log.error("account.totals_failed", { userId: String(req.user?._id), err: err as Error });
    res.status(500).json({ message: "Failed to fetch account" });
  }
});

export default router;
