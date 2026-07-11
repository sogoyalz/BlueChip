import React from "react";
import { Link } from "react-router-dom";

function Stats() {
  return (
    <div className="container section">
      <div className="row align-items-center gy-4">
        <div className="col-md-6 pe-md-5">
          <span className="eyebrow">Why BlueChip</span>
          <h2 className="section-title mb-4">Learn without losing</h2>
          <div className="row gy-4">
            <div className="col-sm-6">
              <h3 className="fs-6 mb-2">Real market, fake money</h3>
              <p className="text-muted mb-0">
                Prices stream live from the Gemini exchange, so every fill,
                spike, and dip is the real market — but your balance is
                simulated, so mistakes cost nothing.
              </p>
            </div>
            <div className="col-sm-6">
              <h3 className="fs-6 mb-2">No spam or gimmicks</h3>
              <p className="text-muted mb-0">
                No gimmicks, spam, "gamification", or annoying push
                notifications. A clean terminal you use at your own pace.
              </p>
            </div>
            <div className="col-sm-6">
              <h3 className="fs-6 mb-2">The BlueChip universe</h3>
              <p className="text-muted mb-0">
                Eight major cryptocurrencies, one practice account, live
                market data — Bitcoin, Ethereum, Solana, and more in one
                place.
              </p>
            </div>
            <div className="col-sm-6">
              <h3 className="fs-6 mb-2">Real order mechanics</h3>
              <p className="text-muted mb-0">
                Market and limit orders behave exactly like on a real
                exchange — resting orders fill when the market crosses your
                price, at your price or better.
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
              Explore the platform
            </Link>
            <Link className="link-arrow" to="/signup">
              Open the dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Stats;
