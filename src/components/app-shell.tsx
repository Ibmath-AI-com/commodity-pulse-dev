// FILE: src/components/app-shell.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Settings, LogOut, User } from "lucide-react";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

const LS_COMMODITY = "ai_commodity_selected";

const LOGOUT_KEYS = ["auth_token", "user", "session", "is_logged_in", LS_COMMODITY];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function titleCase(s: string) {
  const x = (s ?? "").trim();
  if (!x) return "";
  return x.charAt(0).toUpperCase() + x.slice(1);
}

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/home", label: "HOME" },
  { href: "/prediction", label: "PREDICTION" },
  { href: "/upload", label: "UPLOAD" },
  { href: "/report", label: "REPORT" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href);
}

function clearAllCookies() {
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const c of cookies) {
    const eqPos = c.indexOf("=");
    const name = (eqPos > -1 ? c.slice(0, eqPos) : c).trim();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

function purgePredictionCache() {
  const prefix = "prediction:lastResult:v2:";
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) window.localStorage.removeItem(k);
    }
  } catch {}
}

function purgePrintCache() {
  const prefix = "print:";
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) window.localStorage.removeItem(k);
    }
  } catch {}
}

function initialsFromEmailOrName(email?: string | null, name?: string | null) {
  const src = String(name ?? "").trim() || String(email ?? "").trim();
  if (!src) return "U";
  const beforeAt = src.includes("@") ? src.split("@")[0] : src;
  const cleaned = beforeAt.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  if (!cleaned) return "U";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const two =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0])
      : cleaned.length >= 2
      ? cleaned.slice(0, 2)
      : cleaned.slice(0, 1);
  return two.toUpperCase();
}

export function AppShell({ title, children }: { title?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [selectedCommodity, setSelectedCommodity] = useState<string>("");

  // Replace gear icon with user menu
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  // Live time display
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // auth user display
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email ?? null);
      setUserName(u?.displayName ?? null);
    });
    return () => unsub();
  }, []);

  const timeText = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat("en-AU", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short",
      }).formatToParts(now);

      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      const weekday = get("weekday").toUpperCase();
      const day = get("day");
      const month = get("month").toUpperCase();
      const year = get("year");
      const hour = get("hour");
      const minute = get("minute");
      const second = get("second");
      const tz = get("timeZoneName");

      return `${weekday} ${day} ${month} ${year} | ${hour}:${minute}:${second} ${tz}`;
    } catch {
      return now.toISOString();
    }
  }, [now]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      const v = (window.localStorage.getItem(LS_COMMODITY) ?? "").trim();
      setSelectedCommodity(v);
    };

    read();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_COMMODITY) read();
    };

    const onCommodity = () => read();

    window.addEventListener("storage", onStorage);
    window.addEventListener("ai:commodity", onCommodity as any);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ai:commodity", onCommodity as any);
    };
  }, []);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!userRef.current) return;
      if (!userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUserOpen(false);
    }

    if (userOpen) {
      document.addEventListener("mousedown", onDocDown);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  function hardLogout() {
    try {
      if (typeof window !== "undefined") {
        for (const k of LOGOUT_KEYS) {
          window.localStorage.removeItem(k);
          window.sessionStorage.removeItem(k);
        }
        purgePredictionCache();
        purgePrintCache();
        clearAllCookies();
      }
    } finally {
      setUserOpen(false);
      window.location.assign("/");
    }
  }

  const initials = useMemo(() => initialsFromEmailOrName(userEmail, userName), [userEmail, userName]);

    const displayLabel = useMemo(() => {
    const n = (userName ?? "").trim();
    return n ? n : initials;
  }, [userName, initials]);

  return (
    <div className="tt-terminal">
      <header className="tt-header">
        {/* Top dark strip */}
        <div className="tt-headerTop">
          <div className="tt-brandSection">
            <Link href="/" className="tt-logoContainer" aria-label="Home">
              <div className="tt-brand">
                <span className="tt-logoMark" aria-hidden="true">
                  C
                </span>
                <span className="tt-companyRest pl-1">Cali Commodity Pulse</span>
              </div>
            </Link>

            {selectedCommodity ? (
              <div className="tt-marketTicker">
                <div className="tt-tickerItem">
                  <span className="tt-tickerLabel">ACTIVE</span>
                  <span className="tt-tickerValue tt-tickerUp">{titleCase(selectedCommodity)}</span>
                </div>
              </div>
            ) : (
              ""
            )}
          </div>

          <div className="tt-userSection">
            <span className="tt-timeDisplay">{timeText}</span>

            <button className="tt-iconBtn" type="button" title="Notifications" aria-label="Notifications">
              <Bell className="tt-icon" />
            </button>

            {/* ✅ User menu (replaces gear icon) */}
            <div className="tt-settingsWrap" ref={userRef}>
              <button
                className={cx("tt-iconBtn", userOpen && "tt-iconBtnActive")}
                type="button"
                title={userEmail ? `Signed in as ${userEmail}` : "User"}
                aria-label="User menu"
                onClick={() => setUserOpen((v) => !v)}
              >
                {/* Initials chip */}
                <span
                  aria-hidden="true"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: 0.4,
                    color: "#172b4d",
                    background: "#deebff",
                    border: "1px solid #b3d4ff",
                  }}
                >
                  {initials}
                </span>
              </button>

              {userOpen ? (
                <div className="tt-menu">
                  <div className="tt-menuHeader">ACCOUNT</div>

                  <div className="tt-menuItem" style={{ cursor: "default" as const }}>
                    <User className="tt-menuIcon" />
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontWeight: 800, color: "#172b4d" }}>{displayLabel}</span>
                      <span style={{ fontSize: 12, color: "#5e6c84", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {userEmail || "—"}
                      </span>
                    </span>
                  </div>

                  <div className="tt-menuDivider" />

                  {/* Keep your current list */}
                  <Link className="tt-menuItem" href="/settings" onClick={() => setUserOpen(false)}>
                    <Settings className="tt-menuIcon" />
                    Settings
                  </Link>

                  <div className="tt-menuDivider" />

                  <button className="tt-menuItem tt-menuDanger" type="button" onClick={hardLogout}>
                    <LogOut className="tt-menuIcon" />
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* White nav row */}
        <nav className="tt-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx("tt-navLink", isActive(pathname, item.href) && "tt-navLinkActive")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="tt-main">
        {title ? <div className="tt-pageTitle">{title}</div> : null}
        {children}
      </main>

      <footer className="tt-footer">
        © {new Date().getFullYear()} Commodity Pulse | Market data delayed by 15 minutes | For professional use only
      </footer>
    </div>
  );
}
