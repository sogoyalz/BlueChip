import React from "react";
import { Link } from "react-router-dom";

function Pricing() {
  return (
    <div className="section section--band">
      <div className="container">
        <div className="row align-items-center gy-4">
          <div className="col-md-4">
            <span className="eyebrow">Pricing</span>
            <h2 className="section-title mb-3">Free. All of it.</h2>
            <p className="mb-4">
              Every account trades on Gemini's sandbox exchange with test
              funds, and the crypto market never closes — trade 24/7 without
              risking a cent.
            </p>
            <Link className="link-arrow" to="/pricing">
              See pricing
            </Link>
          </div>
          <div className="col-md-2"></div>
          <div className="col-md-6">
            <div className="row text-center gy-3">
              <div className="col-sm-6">
                <div className="panel h-100">
                  <div className="stat-figure mb-2">Sandbox</div>
                  <p className="mb-0 fine-print">
                    Real order fills on Gemini's test exchange
                  </p>
                </div>
              </div>
              <div className="col-sm-6">
                <div className="panel h-100">
                  <div className="stat-figure mb-2">$0</div>
                  <p className="mb-0 fine-print">
                    Real money at risk — ever
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Pricing;
