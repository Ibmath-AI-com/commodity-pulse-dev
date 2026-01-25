// FILE: src/components/app-suspense.tsx
"use client";

import React, { Suspense } from "react";

export default function AppSuspense({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
