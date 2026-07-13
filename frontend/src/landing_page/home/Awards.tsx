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
          <span className="eyebrow">The real thing, sandboxed</span>
          <h2 className="section-title mb-3">
            A real exchange, minus the risk
          </h2>
          <p className="section-lede mb-4">
            BlueChip isn't a simulation bolted onto fake data — orders place
            for real on Gemini's sandbox exchange: live market data, real
            order types, real matching, real fills. The only thing that
            isn't real is the money.
          </p>
          <div className="row">
            <div className="col-md-6">
              <ul className="checklist">
                <li>Live Gemini prices</li>
                <li>Market &amp; limit orders</li>
                <li>Real Gemini sandbox fills</li>
              </ul>
            </div>
            <div className="col-md-6">
              <ul className="checklist">
                <li>Candlestick charts</li>
                <li>Live order book depth</li>
                <li>Zero real money, ever</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Awards;
