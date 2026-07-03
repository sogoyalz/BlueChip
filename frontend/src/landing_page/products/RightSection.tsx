import React from "react";
import { Link } from "react-router-dom";

interface RightSectionProps {
  imageURL: string;
  productName: string;
  productDescription: string;
  learnMore: string;
}

function RightSection({
  imageURL,
  productName,
  productDescription,
  learnMore,
}: RightSectionProps) {
  return (
    <div className="container section">
      <div className="row align-items-center gy-4">
        <div className="col-md-6 order-2 order-md-1 pe-md-5">
          <h2 className="section-title mb-3">{productName}</h2>
          <p className="section-lede mb-4">{productDescription}</p>
          <Link className="link-arrow" to={learnMore}>
            Learn More
          </Link>
        </div>
        <div className="col-md-6 order-1 order-md-2">
          <div className="img-frame">
            <img src={imageURL} alt={productName} className="img-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default RightSection;
