//aicommodity\src\app\page.tsx
"use client";


import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LoginBackground from "@/components/LoginBackground";

import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

const LS_COMMODITY = "ai_commodity_selected"; 

export default function HomePage() {
  const router = useRouter();

  const [commodity, setCommodity] = useState("sulphur"); // keep as-is
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [mode, setMode] = useState<"login" | "signup">("login");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isValid = useMemo(() => {
    const e = email.trim();
    const p = password.trim();
    return e.length > 3 && e.includes("@") && p.length >= 6; // Firebase recommends 6+
  }, [email, password]);

  async function upsertUser(uid: string, userEmail: string) {
    await setDoc(
      doc(db, "users", uid),
      {
        email: userEmail,
        role: "user",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(), // merge=true prevents overwriting if exists
      },
      { merge: true }
    );
  }

 async function handleAuth() {
  const e = email.trim();
  const p = password;

  setErr(null);
  setBusy(true);

  console.log("HANDLE AUTH START", {
    apiKey: auth.app.options.apiKey,
    authDomain: auth.app.options.authDomain,
    projectId: auth.app.options.projectId,
  });

  const withTimeout = <T,>(promise: Promise<T>, ms = 12000) =>
    Promise.race([
      promise,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error("AUTH_TIMEOUT")), ms)),
    ]);

  try {
    const authPromise =
      mode === "signup"
        ? createUserWithEmailAndPassword(auth, e, p)
        : signInWithEmailAndPassword(auth, e, p);

    const cred = await withTimeout(authPromise, 12000);

    console.log("SIGNED IN", cred.user.uid);

    // Do NOT block login on Firestore write while debugging
    upsertUser(cred.user.uid, cred.user.email || e).catch((er) =>
      console.warn("upsertUser failed:", er?.code || er?.message || er)
    );

      localStorage.setItem(LS_COMMODITY, commodity);
      window.dispatchEvent(new Event("ai:commodity"));
      router.push("/home");
  } catch (ex: any) {
    console.error("AUTH FAILED:", ex?.code, ex?.message, ex);

    if (ex?.message === "AUTH_TIMEOUT") {
      setErr("Auth request is hanging. Likely blocked by browser extension, network, or firewall.");
    } else {
      setErr(ex?.code || ex?.message || "Login failed.");
    }
  } finally {
    setBusy(false);
  }
}


  return (
    <div style={{ background: "transparent", minHeight: "100vh" }}>
      <LoginBackground />

      <div className="login-container">
        <div className="login-card-wrapper">
          <div className="glow-border" />
          <div className="login-card">
            <div className="login-card-head">

              <div className="header">
                <h2 className="tt-login-companyRest">Commodity Pulse</h2>
              </div>
            </div>

            <form
              className="form"
              onSubmit={(ev) => {
                ev.preventDefault();
                console.log("FORM SUBMIT", { isValid, busy }); 
                if (!isValid || busy) return;
                void handleAuth();
              }}
            >
              <div className="input-group">
                <input
                  type="email"
                  className="input"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>

              <div className="input-group">
                <input
                  type="password"
                  className="input"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>

              {err ? (
                <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>{err}</div>
              ) : null}

              <button type="submit" className="submit-btn" disabled={!isValid || busy}>
                <span>{busy ? "Signing in..." : "Start Analysis"}</span>
                <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>

            </form>

            <p className="feature-text">
              <span className="highlight">Clear price forecasts.</span> Simple explanations.{" "}
              <span className="highlight">Better decisions.</span>
            </p>
          </div>
        </div>

        <p className="footer">Powered by Cali Agricultural </p>
      </div>
    </div>
  );
}
