import "server-only";
import admin from "firebase-admin";

function init() {
  if (admin.apps.length) return admin.app();

  const b64 = process.env.FIREBASE_ADMIN_JSON_BASE64;
  if (b64) {
    const jsonStr = Buffer.from(b64, "base64").toString("utf8");
    const json = JSON.parse(jsonStr);
    return admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  }

  const path = process.env.FIREBASE_ADMIN_KEY_PATH;
  if (path) {
    // Local dev fallback only
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    return admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  }

  throw new Error("Missing FIREBASE_ADMIN_JSON_BASE64 (recommended) or FIREBASE_ADMIN_KEY_PATH");
}

export const adminApp = init();
export const adminDb = admin.firestore(adminApp);
export const adminAuth = admin.auth(adminApp);
export { admin };
