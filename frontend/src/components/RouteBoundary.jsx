import { Component, Suspense } from "react";
import { useLocation } from "react-router";
import LoadingExperience from "./LoadingExperience";

class PageErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="auth-page">
          <div className="auth-container">
            <section className="auth-card" role="alert">
              <h1>This page could not load</h1>
              <p>Check your connection and reload to try again. Your saved investigations are safe.</p>
              <button className="auth-submit" type="button" onClick={() => window.location.reload()}>
                Reload page
              </button>
              <p><a href="/">Return to NETSCOPE home</a></p>
            </section>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default function RouteBoundary({ children }) {
  const { pathname } = useLocation();

  return (
    <PageErrorBoundary key={pathname}>
      <Suspense fallback={
        <main className="netscope-loading-page">
          <LoadingExperience
            title="Bringing your workspace into focus"
            message="Connecting the pieces for your next view."
          />
        </main>
      }>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}
