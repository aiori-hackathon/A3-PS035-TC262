import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const rawApiKey = import.meta.env.VITE_FIREBASE_API_KEY;

// Use configured credentials or safe local fallback defaults to avoid module import crashes
const firebaseConfig = {
  apiKey: rawApiKey || "AIzaSyDummyKeyForLocalDemoModeOnly000",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "netscope-demo.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "netscope-demo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "netscope-demo.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789012:web:demo1234567890",
};

let app = null;
let auth = null;
let googleProvider = null;

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
} catch (error) {
  console.warn("Firebase Auth unconfigured or invalid API key; running in local/demo fallback mode:", error?.message || error);
  auth = {
    currentUser: null,
    onAuthStateChanged: (cb) => {
      setTimeout(() => cb(null), 0);
      return () => {};
    },
  };
  googleProvider = {};
}

export { auth, googleProvider };
export default app;
