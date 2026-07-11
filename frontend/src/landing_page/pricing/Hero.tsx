import React from "react";

function Hero() {
  return (
    <div className="container">
      <div className="section border-bottom text-center">
        <span className="eyebrow">Pricing</span>
        <h1 className="section-title mb-3">
          Everything is free, because nothing is real
        </h1>
        <p className="section-lede mx-auto">
          No commissions, no subscriptions, no deposits — every account
          trades a $100,000 simulated balance at live market prices
        </p>
      </div>
      <div className="section">
        <div className="row text-center gy-4">
          <div className="col-md-4">
            <div className="panel h-100">
              <img
                src="/media/images/pricingZero.svg"
                alt="Free forever"
                className="mb-3"
              />
              <h2 className="fs-4 mb-3">$0 to trade</h2>
              <p className="text-muted mb-0">
                Every order — market or limit, any size, any hour — is
                completely free. There is nothing to deposit and nothing to
                pay, ever.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="panel h-100">
              <img
                src="/media/images/pricingFlat.svg"
                alt="Real market data"
                className="mb-3"
              />
              <h2 className="fs-4 mb-3">What IS real</h2>
              <p className="text-muted mb-0">
                Live Gemini market data, real order mechanics, real
                volatility, and honest P&amp;L. The market you practice
                against is the actual market.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="panel h-100">
              <img
                src="/media/images/pricingZero.svg"
                alt="Simulated funds"
                className="mb-3"
              />
              <h2 className="fs-4 mb-3">What is simulated</h2>
              <p className="text-muted mb-0">
                Your money. Every account starts with $100,000 of practice
                funds, and you can reset back to that any time from the
                dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hero;
