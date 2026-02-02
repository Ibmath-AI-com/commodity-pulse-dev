// FILE: src/app/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { auth } from "@/lib/firebaseClient";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";

import { User, KeyRound, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Toast = { type: "success" | "error"; msg: string } | null;

export default function SettingsPage() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState<string>("");

  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUid(null);
        router.replace("/");
        return;
      }
      setUid(u.uid);
      setEmail(u.email ?? null);
      setDisplayName(u.displayName ?? "");
      setProviderIds((u.providerData ?? []).map((p) => p.providerId).filter(Boolean));
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const canChangePassword = useMemo(() => providerIds.includes("password"), [providerIds]);

  async function saveName() {
    const u = auth.currentUser;
    if (!u) return;

    const next = displayName.trim();
    if (!next) {
      setToast({ type: "error", msg: "Display name cannot be empty." });
      return;
    }

    setSavingName(true);
    setToast(null);
    try {
      await updateProfile(u, { displayName: next });
      setToast({ type: "success", msg: "Name updated." });
    } catch (e: any) {
      setToast({ type: "error", msg: e?.message || "Failed to update name." });
    } finally {
      setSavingName(false);
    }
  }

  async function changePasswordNow() {
    const u = auth.currentUser;
    if (!u) return;

    if (!canChangePassword) {
      setToast({ type: "error", msg: "Password change is only available for email/password accounts." });
      return;
    }
    if (!email) {
      setToast({ type: "error", msg: "Missing email for re-authentication." });
      return;
    }
    if (!currentPassword.trim()) {
      setToast({ type: "error", msg: "Enter your current password." });
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      setToast({ type: "error", msg: "New password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setToast({ type: "error", msg: "New password and confirmation do not match." });
      return;
    }

    setSavingPass(true);
    setToast(null);
    try {
      const cred = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, newPassword);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");

      setToast({ type: "success", msg: "Password updated." });
    } catch (e: any) {
      setToast({ type: "error", msg: e?.message || "Failed to update password." });
    } finally {
      setSavingPass(false);
    }
  }

  if (!uid) {
    return (
      <AppShell title="Settings">
        <div className="pf-page">
          <div className="pf-container" style={{ gridTemplateColumns: "1fr" }}>
            <div className="glass-pro ring-soft rounded-[10px] p-6">
              <div className="text-sm font-semibold text-slate-700">Settings</div>
              <div className="mt-1 text-base font-semibold text-slate-900">Please sign in.</div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings">
      <div className="workspace">
        {/* ASIDE (summary / "right section" moved here) */}
        <aside className="control-sidebar">
          <div className="module">
            <div className="module-header">Account</div>
            <div className="module-content">
              {toast ? (
                <div
                  style={{
                    border: "1px solid #dfe1e6",
                    background: toast.type === "success" ? "#e3fcef" : "#ffebe6",
                    color: toast.type === "success" ? "#006644" : "#de350b",
                    padding: 10,
                    fontSize: 12,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {toast.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {toast.msg}
                </div>
              ) : null}

              <div className="input-row" style={{ marginTop: toast ? 10 : 0 }}>
                <label className="input-label">Email</label>
                <div className="tt-input" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#172b4d", fontWeight: 800 }}>{email || "—"}</span>
                </div>
              </div>

              <div className="input-row">
                <label className="input-label">Display name</label>
                <div className="tt-input" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <User className="h-4 w-4" style={{ color: "#5e6c84" }} />
                  <span style={{ color: "#172b4d", fontWeight: 800 }}>{displayName.trim() || "—"}</span>
                </div>
              </div>

              <div className="input-row">
                <label className="input-label">Password</label>
                <div className="tt-input" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <KeyRound className="h-4 w-4" style={{ color: "#5e6c84" }} />
                  <span style={{ color: "#172b4d", fontWeight: 800 }}>
                    {canChangePassword ? "Email/password enabled" : "Managed by provider"}
                  </span>
                </div>

                {!canChangePassword ? (
                  <div
                    style={{
                      marginTop: 8,
                      border: "1px solid #ffe2bd",
                      background: "#fffae6",
                      color: "#7a5a00",
                      padding: 10,
                      fontSize: 12,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Password change is disabled for this sign-in method.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN (forms) */}
        <main className="main-panel">
<section className="panel-section">
  <div className="section-header">
    <h2 className="section-title">Setting</h2>
    <div className="section-actions" />
  </div>

  {/* two blocks next to each other */}
  <div className="p-6 grid gap-8 lg:grid-cols-2">
    {/* LEFT: PROFILE */}
    <div>
      <div className="grid gap-3" style={{ maxWidth: 320 }}>
        <h3 className="section-title mb-5">PROFILE</h3>

        <div className="input-row">
          <label className="input-label">Display Name</label>
          <input
            className="tt-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            disabled={savingName}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="toolbar-btn" type="button" onClick={saveName} disabled={savingName}>
            {savingName ? "SAVING..." : "SAVE"}
          </button>
        </div>
      </div>
    </div>

    {/* RIGHT: CHANGE PASSWORD */}
    <div>
      <div className="grid gap-3" style={{ maxWidth: 320 }}>
        <h3 className="section-title mb-5">CHANGE PASSWORD</h3>

        <div className="input-row">
          <label className="input-label">Current Password</label>
          <input
            className="tt-input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            disabled={savingPass || !canChangePassword}
          />
        </div>

        <div className="input-row">
          <label className="input-label">New Password</label>
          <input
            className="tt-input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 6 characters"
            disabled={savingPass || !canChangePassword}
          />
        </div>

        <div className="input-row">
          <label className="input-label">Confirm New Password</label>
          <input
            className="tt-input"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="Repeat new password"
            disabled={savingPass || !canChangePassword}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="toolbar-btn"
            type="button"
            onClick={changePasswordNow}
            disabled={savingPass || !canChangePassword}
          >
            {savingPass ? "UPDATING..." : "UPDATE"}
          </button>
        </div>
      </div>
    </div>
  </div>
</section>

        </main>
      </div>
    </AppShell>
  );
}
