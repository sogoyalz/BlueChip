// The shared Gemini sandbox account: its holdings and its totals. Every
// signed-in user sees the same figures — there is one account behind them all.

import { Router } from "express";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { getHoldings, getAccountTotals } from "../services/account";
import { log } from "../util/logger";

const router = Router();

router.get("/api/holdings", verifyToken, async (_req, res) => {
  try {
    res.json(await getHoldings());
  } catch (err) {
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
    log.error("account.totals_failed", { userId: String(req.user?._id), err: err as Error });
    res.status(500).json({ message: "Failed to fetch account" });
  }
});

export default router;
