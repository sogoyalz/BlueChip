import React from "react";
import { Link } from "react-router-dom";

function NotFound() {
  return (
    <div className="container section text-center">
      <span className="eyebrow">404</span>
      <h1 className="section-title mb-3">Page not found</h1>
      <p className="section-lede mx-auto mb-4">
        Sorry, the page you are looking for does not exist.
      </p>
      <Link className="link-arrow" to="/">
        Back to home
      </Link>
    </div>
  );
}

export default NotFound;
