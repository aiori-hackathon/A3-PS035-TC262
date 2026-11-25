import { useEffect, useState } from "react";

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  reload,
} from "firebase/auth";

import { auth } from "../services/firebaseAuth.js";

import { AuthContext } from "./authState";

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [profileRevision, setProfileRevision] = useState(0);
  const [loading, setLoading] = useState(() => Boolean(auth && typeof onAuthStateChanged === "function"));

  useEffect(() => {
    if (!auth || typeof onAuthStateChanged !== "function") {
      return undefined;
    }

    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          setCurrentUser(user);
          setLoading(false);
        },
        (error) => {
          console.error("Authentication state error:", error);
          setCurrentUser(null);
          setLoading(false);
        },
      );
    } catch (e) {
      console.warn("Unable to attach auth state listener:", e);
      queueMicrotask(() => {
        setCurrentUser(null);
        setLoading(false);
      });
    }

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  async function signup(email, password) {
    if (!auth) {
      throw new Error("Authentication is not configured in offline/demo mode.");
    }
    return createUserWithEmailAndPassword(auth, email, password);
  }

  async function login(email, password) {
    if (!auth) {
      throw new Error("Authentication is not configured in offline/demo mode.");
    }
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function loginWithGoogle() {
    if (!auth) {
      throw new Error("Google authentication is not configured in offline/demo mode.");
    }
    const provider = new GoogleAuthProvider();

    return signInWithPopup(auth, provider);
  }

  async function logout() {
    if (!auth) {
      setCurrentUser(null);
      return;
    }
    return signOut(auth);
  }

  async function refreshProfile() {
    const user = auth.currentUser;
    if (!user) return;
    await reload(user);
    if (auth.currentUser?.uid === user.uid) setProfileRevision(value => value + 1);
  }

  const value = {
    refreshProfile,
    profileRevision,
    currentUser,
    loading,
    signup,
    login,
    loginWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
