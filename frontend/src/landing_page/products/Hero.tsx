import React from "react";
import { Link } from "react-router-dom";

function Hero() {
  return (
    <div className="container border-bottom">
      <div className="section text-center">
        <span className="eyebrow">Products</span>
        <h1 className="section-title mb-3">The BlueChip product suite</h1>
        <p className="section-lede mx-auto mb-4">
          Sleek, modern and intuitive platforms for every kind of investor
        </p>
        <Link className="link-arrow" to="/pricing">
          Check out our investment offerings
        </Link>
      </div>
    </div>
  );
}

export default Hero;
