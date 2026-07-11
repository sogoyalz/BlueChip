import React from "react";
import { Link } from "react-router-dom";

function Stats() {
  return (
    <div className="container section">
      <div className="row align-items-center gy-4">
        <div className="col-md-6 pe-md-5">
          <span className="eyebrow">Why BlueChip</span>
          <h2 className="section-title mb-4">Trust with confidence</h2>
          <div className="row gy-4">
            <div className="col-sm-6">
              <h3 className="fs-6 mb-2">Customer-first always</h3>
              <p className="text-muted mb-0">
                Every decision starts with a simple question: is this good for
                the people who trust us with their money? No dark patterns, no
                fine print surprises.
              </p>
            </div>
            <div className="col-sm-6">
              <h3 className="fs-6 mb-2">No spam or gimmicks</h3>
              <p className="text-muted mb-0">
                No gimmicks, spam, "gamification", or annoying push
                notifications. High quality apps that you use at your pace.
              </p>
            </div>
            <div className="col-sm-6">
              <h3 className="fs-6 mb-2">The BlueChip universe</h3>
              <p className="text-muted mb-0">
                Not just an app, but a whole ecosystem. Stocks, options, ETFs,
                bonds, and IPOs — one account, every market.
              </p>
            </div>
            <div className="col-sm-6">
              <h3 className="fs-6 mb-2">Do better with money</h3>
              <p className="text-muted mb-0">
                With built-in nudges and risk guardrails, we actively help you
                do better with your money.
              </p>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="img-frame mb-4">
            <img
              src="/media/images/ecosystem.svg"
              alt="The BlueChip ecosystem"
              className="img-full"
            />
          </div>
          <div className="d-flex justify-content-center gap-4 flex-wrap">
            <Link className="link-arrow" to="/product">
              Explore our products
            </Link>
            <Link className="link-arrow" to="/signup">
              Try Terminal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Stats;
