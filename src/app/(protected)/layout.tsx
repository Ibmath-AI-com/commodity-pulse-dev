// FILE: src/app/(protected)/layout.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebaseAdmin";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies(); // ✅ await
  const session = cookieStore.get("session")?.value;

  if (!session) redirect("/login");

  try {
    await adminAuth.verifySessionCookie(session, true);
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}
