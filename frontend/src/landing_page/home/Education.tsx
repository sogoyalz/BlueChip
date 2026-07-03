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
          <h2 className="section-title mb-3">
            Free and open market education
          </h2>
          <p className="section-lede">
            BlueChip Learn, our free library of stock market lessons, covers
            everything from the basics to advanced trading — no signup
            required.
          </p>
          <Link className="link-arrow mb-3" to="/support">
            Learn
          </Link>
          <p className="section-lede">
            The BlueChip Community, an active forum of traders and investors,
            is the place to get all your market related queries answered.
          </p>
          <Link className="link-arrow" to="/support">
            Community
          </Link>
        </div>
      </div>
    </div>
  );
}
export default Education;
