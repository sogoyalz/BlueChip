import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import { API_URL, DASHBOARD_URL } from "../../config";

function Signup() {
  const [values, setValues] = useState({ email: "", password: "", username: "" });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues({ ...values, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/signup`,
        { ...values },
        { withCredentials: true } // <-- send/receive the cookie
      );
      if (data.success) {
        toast.success(data.message);
        setTimeout(() => {
          // The signup response already set the auth cookie (sameSite:none in
          // production, shared localhost domain in dev), so the dashboard is
          // authenticated the moment it loads — no token in the URL.
          window.location.href = DASHBOARD_URL;
        }, 1000);
      } else {
        toast.error(data.message);
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      // The API reports duplicate emails/bad input as 4xx with a message body.
      const message = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      toast.error(message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-split">
        <aside className="auth-aside">
          <span className="auth-brand">
            <img src="/media/images/logo.svg" alt="BlueChip" />
          </span>
          <h1 className="auth-headline">
            Trade crypto for real, <span className="accent">risk nothing.</span>
          </h1>
          <p className="auth-blurb">
            Your orders place for real on Gemini's sandbox exchange at live
            market prices. The mechanics are real — the money never is.
          </p>
          <ul className="auth-points">
            <li>
              <span className="tick">✓</span>
              Live Bitcoin, Ethereum &amp; Solana prices from Gemini
            </li>
            <li>
              <span className="tick">✓</span>
              Real market &amp; limit orders with honest fills and P&amp;L
            </li>
            <li>
              <span className="tick">✓</span>
              Zero deposits, zero fees, zero real money at risk
            </li>
          </ul>
        </aside>

        <div className="auth-card">
          <h2>Create account</h2>
          <p className="auth-subtitle">Open a free account in a few seconds.</p>

          <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              className="form-control"
              placeholder="you@example.com"
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              name="username"
              className="form-control"
              placeholder="Choose a username"
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              className="form-control"
              placeholder="Create a password (min. 8 characters)"
              onChange={handleChange}
              minLength={8}
              required
            />
          </div>

          <button type="submit" className="btn btn-auth" disabled={loading}>
            {loading ? "Creating account…" : "Sign up"}
          </button>

          <span className="auth-switch">
            Already have an account? <Link to="/login">Login</Link>
          </span>
          </form>
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={2500} />
    </div>
  );
}

export default Signup;
