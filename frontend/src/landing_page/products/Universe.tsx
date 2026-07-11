import React from "react";
import { Link } from "react-router-dom";

const features = [
  { title: "Stocks & IPOs", text: "Invest across NASDAQ and NYSE with real-time data" },
  { title: "Options & futures", text: "Trade derivatives with live margin insights" },
  { title: "Mutual funds", text: "No-transaction-fee funds, via Vault" },
  { title: "Bonds & Treasuries", text: "Government and corporate debt in one click" },
  { title: "ETFs", text: "Diversify with low-cost index investing" },
  { title: "API access", text: "Automate your strategies with BlueChip API" },
];

function Universe() {
  return (
    <div className="section section--band">
      <div className="container text-center">
        <span className="eyebrow">Everything under one roof</span>
        <h2 className="section-title mb-3">The BlueChip Universe</h2>
        <p className="section-lede mx-auto mb-4">
          One account, one balance, every market — everything you need to
          trade and invest under a single roof
        </p>

        <div className="row gy-4 mb-5">
          {features.map((feature) => (
            <div className="col-md-4 col-sm-6" key={feature.title}>
              <div className="panel h-100 text-start">
                <h3 className="fs-6 mb-2">{feature.title}</h3>
                <p className="text-muted mb-0">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
        <Link className="btn btn-primary btn-lg" to="/signup">
          Sign up now
        </Link>
      </div>
    </div>
  );
}

export default Universe;
