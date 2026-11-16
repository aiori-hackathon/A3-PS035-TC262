import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { updateProfile } from "firebase/auth";
import { useAuth } from "../contexts/authState";
import { authDestination } from "../utils/authNavigation";

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signup, loginWithGoogle } = useAuth();
  const destination = authDestination(location.state?.from);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  async function handleSignup(event) {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const result = await signup(form.email.trim(), form.password);

      await updateProfile(result.user, {
        displayName: form.name.trim(),
      });

      navigate(destination, { replace: true });
    } catch (err) {
      console.error("Firebase Signup Error:", err.code, err.message);

      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered.");
      } else if (err.code === "auth/invalid-email") {
        setError("Enter a valid email address.");
      } else if (err.code === "auth/weak-password") {
        setError("Please use a stronger password.");
      } else {
        setError(`Signup failed: ${err.code || "unknown-error"}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignup() {
    setError("");
    setLoading(true);

    try {
      await loginWithGoogle();
      navigate(destination, { replace: true });
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        <Link to="/" className="auth-logo">
          <span className="auth-logo-mark">N</span>
          NETSCOPE<span className="auth-logo-dot">.</span>
        </Link>

        <div className="auth-card">
          <span className="auth-eyebrow">YOUR WORKSPACE STARTS HERE</span>

          <h1>
            Create your account<span>.</span>
          </h1>

          <p className="auth-description">
            Get your own space to investigate network failures, understand root
            causes, and track incidents.
          </p>

          <button
            type="button"
            className="auth-google-button"
            onClick={handleGoogleSignup}
            disabled={loading}
          >
            <span className="auth-google-icon" aria-hidden="true">G</span>
            Continue with Google
          </button>

          <p className="auth-progress" role="status">{loading ? "Creating your account…" : ""}</p>

          <div className="auth-divider">
            <span>or continue with email</span>
          </div>

          <form onSubmit={handleSignup} aria-busy={loading}>
            <label htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              name="name"
              type="text"
              placeholder="Your full name"
              autoComplete="name"
              value={form.name}
              onChange={updateField}
              required
            />

            <label htmlFor="signup-email">Email address</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.email}
              onChange={updateField}
              required
            />

            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              name="password"
              type="password"
              placeholder="Choose a password"
              minLength={6}
              aria-describedby="signup-password-hint"
              autoComplete="new-password"
              value={form.password}
              onChange={updateField}
              required
            />

            <p id="signup-password-hint" className="auth-field-hint">Use at least 6 characters.</p>

            <label htmlFor="signup-confirm">Confirm password</label>
            <input
              id="signup-confirm"
              name="confirmPassword"
              type="password"
              placeholder="Re-enter password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={updateField}
              required
            />

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="auth-submit-button"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create account →"}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login" state={location.state}>Log in</Link>
          </p>
        </div>

        <p className="auth-footer">
          © NETSCOPE · Evidence-based network intelligence
        </p>
      </div>
    </main>
  );
}
