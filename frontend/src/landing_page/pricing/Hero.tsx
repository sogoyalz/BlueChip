import React from "react";

function Hero() {
  return (
    <div className="container">
      <div className="section border-bottom text-center">
        <span className="eyebrow">Pricing</span>
        <h1 className="section-title mb-3">Simple, transparent pricing</h1>
        <p className="section-lede mx-auto">
          Free equity investments and flat ₹20 intraday and F&O trades
        </p>
      </div>
      <div className="section">
        <div className="row text-center gy-4">
          <div className="col-md-4">
            <div className="panel h-100">
              <img
                src="/media/images/pricingZero.svg"
                alt="Zero brokerage"
                className="mb-3"
              />
              <h2 className="fs-4 mb-3">Free equity delivery</h2>
              <p className="text-muted mb-0">
                All equity delivery investments (NSE, BSE), are absolutely
                free — ₹0 brokerage.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="panel h-100">
              <img
                src="/media/images/pricingFlat.svg"
                alt="Flat ₹20 per order"
                className="mb-3"
              />
              <h2 className="fs-4 mb-3">Intraday and F&O trades</h2>
              <p className="text-muted mb-0">
                Flat ₹20 or 0.03% (whichever is lower) per executed order on
                intraday trades across equity, currency, and commodity trades.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="panel h-100">
              <img
                src="/media/images/pricingZero.svg"
                alt="Zero commission"
                className="mb-3"
              />
              <h2 className="fs-4 mb-3">Free direct MF</h2>
              <p className="text-muted mb-0">
                All direct mutual fund investments are absolutely free — ₹0
                commissions &amp; DP charges.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hero;
