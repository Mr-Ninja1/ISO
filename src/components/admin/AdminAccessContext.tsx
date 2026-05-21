"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAdminAccess, type AdminAccessStatus } from "@/lib/client/useAdminAccess";

type AdminAccessValue = {
  status: AdminAccessStatus;
  accessToken: string;
  userEmail: string;
  sessionHint: string;
  signOut: () => void | Promise<void>;
  clearSessionHint: () => void;
};

const AdminAccessContext = createContext<AdminAccessValue | null>(null);

export function AdminAccessProvider({ children }: { children: ReactNode }) {
  const value = useAdminAccess();
  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccessContext() {
  const ctx = useContext(AdminAccessContext);
  if (!ctx) {
    throw new Error("useAdminAccessContext must be used within AdminAccessProvider");
  }
  return ctx;
}
