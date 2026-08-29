import React from "react";
import { Link } from "react-router-dom";

interface LeftSectionProps {
  imageURL: string;
  productName: string;
  productDescription: string;
  tryDemo: string;
  learnMore: string;
}

function LeftSection({
  imageURL,
  productName,
  productDescription,
  tryDemo,
  learnMore,
}: LeftSectionProps) {
  return (
    <div className="container section">
      <div className="row align-items-center gy-4">
        <div className="col-md-6">
          <div className="img-frame">
            <img src={imageURL} alt={productName} className="img-full" />
          </div>
        </div>
        <div className="col-md-6 ps-md-5">
          <h2 className="section-title mb-3">{productName}</h2>
          <p className="section-lede mb-4">{productDescription}</p>
          <div className="d-flex gap-4 flex-wrap">
            <Link className="link-arrow" to={tryDemo}>
              Open it
            </Link>
            <Link className="link-arrow" to={learnMore}>
              How it works
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeftSection;
