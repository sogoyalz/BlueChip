import React from "react";
import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="site-footer mt-5">
      <div className="container">
        <div className="row gy-4">
          <div className="col-12 col-md-3">
            <img
              src="/media/images/logo.svg"
              alt="BlueChip"
              className="footer-logo"
            />
            <p className="fine-print mt-3">
              &copy; 2026, BlueChip Securities, Inc. All rights reserved.
            </p>
          </div>
          <div className="col-6 col-md-3">
            <span className="eyebrow">Company</span>
            <ul className="footer-links">
              <li>
                <Link to="/about">About</Link>
              </li>
              <li>
                <Link to="/product">Products</Link>
              </li>
              <li>
                <Link to="/pricing">Pricing</Link>
              </li>
              <li>
                <Link to="/product">Referral programme</Link>
              </li>
              <li>
                <Link to="/about">Careers</Link>
              </li>
              <li>
                <Link to="/about">Engineering blog</Link>
              </li>
              <li>
                <Link to="/about">Press &amp; media</Link>
              </li>
              <li>
                <Link to="/about">BlueChip cares (CSR)</Link>
              </li>
            </ul>
          </div>
          <div className="col-6 col-md-3">
            <span className="eyebrow">Support</span>
            <ul className="footer-links">
              <li>
                <Link to="/support">Contact</Link>
              </li>
              <li>
                <Link to="/support">Support portal</Link>
              </li>
              <li>
                <Link to="/support">BlueChip Learn</Link>
              </li>
              <li>
                <Link to="/pricing">List of charges</Link>
              </li>
              <li>
                <Link to="/support">Downloads &amp; resources</Link>
              </li>
            </ul>
          </div>
          <div className="col-6 col-md-3">
            <span className="eyebrow">Account</span>
            <ul className="footer-links">
              <li>
                <Link to="/signup">Open an account</Link>
              </li>
              <li>
                <Link to="/signup">Fund transfer</Link>
              </li>
              <li>
                <Link to="/login">Login</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="fine-print mt-5">
          <p>
            BlueChip is a demonstration project and not a registered stock
            broker. Nothing on this site is investment advice, and no real
            securities can be bought or sold here.
          </p>

          <p>
            All investing involves risk, including the possible loss of
            principal. Past performance does not guarantee future results.
          </p>

          <p>
            As a business we don't give stock tips, and have not authorized
            anyone to trade on behalf of others. If you find anyone claiming to
            be part of BlueChip and offering such services, please create a
            ticket on our support portal.
          </p>
        </div>
        <div className="border-top pt-3 mt-4 pb-2 d-flex flex-wrap justify-content-between fine-print">
          <span>BlueChip — Trade with conviction</span>
          <span>
            <Link to="/support">Support</Link>
            <span className="mx-2">·</span>
            <Link to="/pricing">Charges</Link>
            <span className="mx-2">·</span>
            <Link to="/about">About</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
