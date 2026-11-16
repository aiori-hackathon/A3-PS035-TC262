import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../contexts/authState";
import { saveInvestigation } from "../services/investigations";

export default function SaveInvestigation({ scenario }) {
  const { currentUser } = useAuth();
  return <SaveSnapshot key={currentUser?.uid || "public"} currentUser={currentUser} scenario={scenario} />;
}

function SaveSnapshot({ currentUser, scenario }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function handleSave() {
    if (!scenario || pending.current || savedId) return;
    if (!currentUser) {
      const query = new URLSearchParams(location.search);
      if (location.pathname === "/demo" && scenario.scenario?.id) {
        query.set("scenario", scenario.scenario.id);
      }
      const queryString = query.toString();
      const search = queryString ? `?${queryString}` : "";
      navigate("/login", { state: { from: { pathname: location.pathname, search, hash: location.hash } } });
      return;
    }
    pending.current = true;
    setSaving(true); setError("");
    // The snapshot passed at click time is the one displayed, even if selection later changes.
    const snapshot = scenario;
    try {
      const id = await saveInvestigation(currentUser, snapshot);
      if (mounted.current) setSavedId(id);
    } catch (err) {
      if (mounted.current) setError(err.code === "permission-denied" ? "Your account cannot save this investigation. Check your access and try again." : "Unable to save this snapshot. Please try again.");
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return <div className="save-investigation">
    <button className="demo-save-button" type="button" onClick={handleSave} disabled={saving || !!savedId || !scenario}>
      {saving ? "Saving displayed snapshot…" : savedId ? "✓ Investigation saved" : currentUser ? "Save investigation ↗" : "Sign in to save ↗"}
    </button>
    {savedId && <p className="demo-save-feedback" role="status">Saved “{scenario?.scenario?.name || scenario?.scenario?.id}”. <Link to={`/dashboard/investigations/${savedId}`}>Open saved report</Link> · <Link to="/dashboard/investigations">My Investigations</Link></p>}
    {error && <p role="alert" className="demo-save-error">{error}</p>}
  </div>;
}
