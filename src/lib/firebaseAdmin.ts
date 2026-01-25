import "server-only";
import admin from "firebase-admin";

function init() {
  if (admin.apps.length) return admin.app();

  // 1) Preferred: base64 JSON (works on Railway/Vercel)
  const b64 = process.env.FIREBASE_ADMIN_JSON_BASE64;
  if (b64 && b64.trim()) {
    const jsonStr = Buffer.from(b64, "base64").toString("utf8");
    const json = JSON.parse(jsonStr);
    return admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  }

  // 2) Optional: use Application Default Credentials if provided by platform
  // (Useful if you mount credentials file via GOOGLE_APPLICATION_CREDENTIALS)
  const gCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gCreds && gCreds.trim()) {
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  // 3) Local dev only: path to JSON file
  const path = process.env.FIREBASE_ADMIN_KEY_PATH;
  if (path && path.trim()) {
    if (process.env.NODE_ENV === "production") {
      // Prevent Railway from ever trying to open a Windows path
      throw new Error(
        "FIREBASE_ADMIN_KEY_PATH is not allowed in production. Use FIREBASE_ADMIN_JSON_BASE64 instead."
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    return admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  }

  throw new Error(
    "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_JSON_BASE64 (recommended) or GOOGLE_APPLICATION_CREDENTIALS."
  );
}

export const adminApp = init();
export const adminDb = admin.firestore(adminApp);
export const adminAuth = admin.auth(adminApp);
export { admin };
