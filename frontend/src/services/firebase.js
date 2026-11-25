import { getFirestore } from "firebase/firestore";
import app from "./firebaseAuth.js";

// Keep the database SDK behind route imports; authentication stays in the app shell.
export { auth, googleProvider, default } from "./firebaseAuth.js";

let db = null;
try {
  if (app) {
    db = getFirestore(app);
  }
} catch (error) {
  console.warn("Firestore unconfigured; running in local/demo fallback mode:", error?.message || error);
}

export { db };
