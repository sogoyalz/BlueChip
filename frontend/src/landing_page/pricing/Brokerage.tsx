import React from "react";
import { Link } from "react-router-dom";

function Brokerage() {
  return (
    <div className="container border-top">
      <div className="section">
        <div className="row gy-4">
          <div className="col-md-8">
            <div className="panel h-100">
              <h3 className="fs-5 mb-4">Good to know</h3>
              <ul className="checklist fine-print mb-0">
                <li>
                  Statutory charges (STT, exchange fees, GST, stamp duty) apply
                  on every trade and are always shown before you place an
                  order.
                </li>
                <li>
                  Digital contract notes will be sent via e-mail, free of
                  charge.
                </li>
                <li>
                  Physical copies of contract notes, if required, shall be
                  charged ₹20 per contract note. Courier charges apply.
                </li>
                <li>
                  Payment gateway deposits are free via UPI; a nominal fee
                  applies to net-banking transfers.
                </li>
                <li>
                  There are no hidden platform fees, subscription tiers, or
                  minimum balance requirements — ever.
                </li>
              </ul>
            </div>
          </div>
          <div className="col-md-4">
            <div className="panel h-100">
              <h3 className="fs-5 mb-3">List of charges</h3>
              <p className="text-muted">
                A full breakdown of every charge that can apply to your
                account, with zero fine print.
              </p>
              <Link className="link-arrow" to="/support">
                Ask us anything
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Brokerage;
