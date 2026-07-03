import React from "react";
import { Link } from "react-router-dom";

interface LeftSectionProps {
  imageURL: string;
  productName: string;
  productDescription: string;
  tryDemo: string;
  learnMore: string;
  googlePlay: string;
  appStore: string;
}

function LeftSection({
  imageURL,
  productName,
  productDescription,
  tryDemo,
  learnMore,
  googlePlay,
  appStore,
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
          <div className="d-flex gap-4 flex-wrap mb-4">
            <Link className="link-arrow" to={tryDemo}>
              Try Demo
            </Link>
            <Link className="link-arrow" to={learnMore}>
              Learn More
            </Link>
          </div>
          <div className="badge-row">
            <Link to={googlePlay}>
              <img
                src="/media/images/googlePlayBadge.svg"
                alt="Get it on Google Play"
              />
            </Link>
            <Link to={appStore}>
              <img
                src="/media/images/appstoreBadge.svg"
                alt="Download on the App Store"
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeftSection;
