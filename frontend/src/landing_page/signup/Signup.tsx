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
          // The dashboard runs on a different origin and cannot read the
          // cookie set for this origin, so hand the token over in the URL.
          window.location.href = `${DASHBOARD_URL}?token=${data.token}`;
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
              placeholder="Create a password"
              onChange={handleChange}
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
      <ToastContainer position="top-right" autoClose={2500} />
    </div>
  );
}

export default Signup;
