import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import { API_URL, DASHBOARD_URL } from "../../config";

function Login() {
  const [values, setValues] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues({ ...values, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/login`,
        { ...values },
        { withCredentials: true }
      );
      if (data.success) {
        toast.success(data.message);
        setTimeout(() => {
          // The login response already set the auth cookie (sameSite:none in
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
      // The API reports bad credentials/input as 4xx with a message body.
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
            Welcome back to <span className="accent">BlueChip.</span>
          </h1>
          <p className="auth-blurb">
            Pick up where you left off — your positions, orders, and portfolio
            are exactly as you left them, at live Gemini prices.
          </p>
          <ul className="auth-points">
            <li>
              <span className="tick">✓</span>
              Live prices streaming from Gemini
            </li>
            <li>
              <span className="tick">✓</span>
              Real order mechanics, honest P&amp;L
            </li>
            <li>
              <span className="tick">✓</span>
              Zero real money at risk, ever
            </li>
          </ul>
        </aside>

        <div className="auth-card">
          <h2>Login</h2>
          <p className="auth-subtitle">Welcome back. Sign in to your account.</p>

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
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              className="form-control"
              placeholder="Enter your password"
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="btn btn-auth" disabled={loading}>
            {loading ? "Signing in…" : "Login"}
          </button>

          <span className="auth-switch">
            Don't have an account? <Link to="/signup">Sign up</Link>
          </span>
          </form>
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={2500} />
    </div>
  );
}

export default Login;
