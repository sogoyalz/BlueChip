import React from "react";
import { Link } from "react-router-dom";

function Pricing() {
  return (
    <div className="section section--band">
      <div className="container">
        <div className="row align-items-center gy-4">
          <div className="col-md-4">
            <span className="eyebrow">Pricing</span>
            <h2 className="section-title mb-3">Unbeatable pricing</h2>
            <p className="mb-4">
              Flat fees, full transparency, and no hidden charges — so you
              always know exactly what a trade costs before you place it.
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
                  <div className="stat-figure mb-2">₹0</div>
                  <p className="mb-0 fine-print">
                    Free equity delivery and direct mutual funds
                  </p>
                </div>
              </div>
              <div className="col-sm-6">
                <div className="panel h-100">
                  <div className="stat-figure mb-2">₹20</div>
                  <p className="mb-0 fine-print">Intraday and F&amp;O</p>
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
