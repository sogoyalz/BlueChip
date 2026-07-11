import React from "react";
import { Link } from "react-router-dom";

function Education() {
  return (
    <div className="container section">
      <div className="row align-items-center gy-4">
        <div className="col-md-6">
          <div className="img-frame">
            <img
              src="/media/images/learn.svg"
              alt="BlueChip Learn"
              className="img-full"
            />
          </div>
        </div>
        <div className="col-md-6 ps-md-5">
          <span className="eyebrow">Education</span>
          <h2 className="section-title mb-3">Learn by doing, not by losing</h2>
          <p className="section-lede">
            Reading about limit orders is one thing — watching your own rest
            in the book and fill when the market crosses it is another.
            BlueChip teaches trading the only way that sticks: with live
            prices, real order types, and honest P&amp;L on every position.
          </p>
          <Link className="link-arrow mb-3" to="/signup">
            Place your first order
          </Link>
          <p className="section-lede">
            Charts, spreads, fills, weighted-average cost — see exactly how
            each one works because your own portfolio depends on it (and only
            your pride is on the line).
          </p>
          <Link className="link-arrow" to="/support">
            How it works
          </Link>
        </div>
      </div>
    </div>
  );
}
export default Education;
