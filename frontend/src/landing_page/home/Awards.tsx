import React from "react";

function Awards() {
  return (
    <div className="container section">
      <div className="row align-items-center gy-4">
        <div className="col-md-6">
          <div className="img-frame">
            <img
              src="/media/images/productTerminal.svg"
              alt="BlueChip Terminal"
              className="img-full"
            />
          </div>
        </div>
        <div className="col-md-6 ps-md-5">
          <span className="eyebrow">The real thing, simulated</span>
          <h2 className="section-title mb-3">
            Everything a real exchange has — minus the risk
          </h2>
          <p className="section-lede mb-4">
            BlueChip mirrors how a real crypto exchange works: live market
            data, real order types, a matching engine, and honest
            profit-and-loss accounting. The only simulated part is the money.
          </p>
          <div className="row">
            <div className="col-md-6">
              <ul className="checklist">
                <li>Live Gemini prices</li>
                <li>Market &amp; limit orders</li>
                <li>Order-matching engine</li>
              </ul>
            </div>
            <div className="col-md-6">
              <ul className="checklist">
                <li>Candlestick charts</li>
                <li>Trader leaderboard</li>
                <li>$100k practice balance</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Awards;
