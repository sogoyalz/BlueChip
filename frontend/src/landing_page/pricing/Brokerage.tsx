import React from "react";
import { Link } from "react-router-dom";

function Brokerage() {
  return (
    <div className="container border-top">
      <div className="section">
        <div className="row gy-4">
          <div className="col-md-8">
            <div className="panel h-100">
              <h3 className="fs-5 mb-4">Good to know</h3>
              <ul className="checklist fine-print mb-0">
                <li>
                  Fills execute at the live Gemini market price. Limit orders
                  fill at your price or better — never worse.
                </li>
                <li>
                  Orders are rejected (never partially honored) if your
                  simulated balance or holdings can't cover them, exactly
                  like a real exchange would.
                </li>
                <li>
                  Market data is briefly delayed-safe: if the live feed goes
                  stale, order execution pauses rather than filling on dead
                  prices.
                </li>
                <li>
                  Crypto markets run 24/7 — there are no market hours,
                  weekends, or holidays.
                </li>
                <li>
                  There are no hidden fees, subscription tiers, or minimum
                  balances — nothing on BlueChip costs real money, ever.
                </li>
              </ul>
            </div>
          </div>
          <div className="col-md-4">
            <div className="panel h-100">
              <h3 className="fs-5 mb-3">Questions?</h3>
              <p className="text-muted">
                How fills work, where prices come from, how the leaderboard
                is ranked — the support portal covers it all.
              </p>
              <Link className="link-arrow" to="/support">
                Ask us anything
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Brokerage;
