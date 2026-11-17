import { Navigate, useLocation } from "react-router";
import { useAuth } from "../contexts/authState";
import LoadingExperience from "./LoadingExperience";

export default function ProtectedRoute({ children }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="netscope-loading-page">
        <LoadingExperience
          title="Checking your access"
          message="Verifying your session before opening the workspace."
        />
      </main>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
