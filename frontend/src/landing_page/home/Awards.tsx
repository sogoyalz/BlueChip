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
          <span className="eyebrow">One account</span>
          <h2 className="section-title mb-3">Everything you need to trade</h2>
          <p className="section-lede mb-4">
            One BlueChip account gives you access to every major market
            segment, with transparent pricing and tools built for both
            first-time investors and seasoned traders.
          </p>
          <div className="row">
            <div className="col-md-6">
              <ul className="checklist">
                <li>Stocks &amp; ETFs</li>
                <li>Options</li>
                <li>Futures</li>
              </ul>
            </div>
            <div className="col-md-6">
              <ul className="checklist">
                <li>Mutual funds</li>
                <li>Bonds &amp; Treasuries</li>
                <li>IPOs</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Awards;
