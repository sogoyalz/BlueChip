import React from "react";

function Hero() {
  return (
    <div className="container">
      <div className="section border-bottom text-center">
        <span className="eyebrow">Pricing</span>
        <h1 className="section-title mb-3">Simple, transparent pricing</h1>
        <p className="section-lede mx-auto">
          $0 commissions on stocks and ETFs, and flat $0.65 options contracts
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
              <h2 className="fs-4 mb-3">$0 stock &amp; ETF trades</h2>
              <p className="text-muted mb-0">
                All online US-listed stock and ETF trades (NASDAQ, NYSE) are
                absolutely free — $0 commissions.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="panel h-100">
              <img
                src="/media/images/pricingFlat.svg"
                alt="Flat per-contract options pricing"
                className="mb-3"
              />
              <h2 className="fs-4 mb-3">Options trading</h2>
              <p className="text-muted mb-0">
                Flat $0.65 per contract per executed options order, with no
                base commission and no exercise or assignment fees.
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
              <h2 className="fs-4 mb-3">No-fee mutual funds</h2>
              <p className="text-muted mb-0">
                Thousands of no-transaction-fee mutual funds — $0 commissions
                &amp; account maintenance fees.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hero;
