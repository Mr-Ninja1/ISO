"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type StaffRow = {
  userId: string;
  role: "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";
  fullName: string;
  email: string;
  hasPin: boolean;
};

type AssignableRole = "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";

type AddStaffResponse = {
  ok: boolean;
  userId: string;
  createdAccount?: boolean;
  email?: string;
  fullName?: string;
  error?: string;
};

type PatchStaffResponse = {
  ok: boolean;
  userId: string;
  passwordUpdated?: boolean;
  email?: string | null;
  fullName?: string | null;
  error?: string;
};

export function StaffManagementPanel({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
  const accessToken = session?.access_token || "";

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<AssignableRole[]>(["MANAGER", "AUDITOR", "VIEWER", "MEMBER"]);
  const [roleDraftByUserId, setRoleDraftByUserId] = useState<Record<string, AssignableRole>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<AssignableRole>("AUDITOR");
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!accessToken || !tenantSlug) return;
    setLoading(true);
    setError("");

    try {
      const url = new URL("/api/staff", window.location.origin);
      url.searchParams.set("tenantSlug", tenantSlug);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed to load staff (${res.status})`);

      const staffRows = Array.isArray(data.staff) ? (data.staff as StaffRow[]) : [];
      setRows(staffRows);
      if (Array.isArray(data.assignableRoles)) {
        const nextRoles = data.assignableRoles as AssignableRole[];
        if (nextRoles.length) setAssignableRoles(nextRoles);
      }
      const drafts: Record<string, AssignableRole> = {};
      for (const row of staffRows) {
        if (row.role !== "ADMIN") {
          drafts[row.userId] = (row.role as AssignableRole) || "MEMBER";
        }
      }
      setRoleDraftByUserId(drafts);
    } catch (err: any) {
      setError(err?.message || "Failed to load staff");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, tenantSlug]);

  async function addOrUpdateStaff() {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, fullName, email, password, role: newStaffRole }),
      });
      const data = (await res.json().catch(() => ({}))) as AddStaffResponse;
      if (!res.ok) throw new Error(data?.error || `Failed to add staff (${res.status})`);

      setMessage(data.createdAccount ? "Staff account created and attached to this brand." : "Staff added/updated successfully.");
      setFullName("");
      setEmail("");
      setPassword("");
      setNewStaffRole("AUDITOR");
      setStaffModalOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to add staff");
    } finally {
      setBusy(false);
    }
  }

  async function removeStaff(userId: string) {
    if (!accessToken) return;
    const accepted = window.confirm("Remove this staff member from the brand?");
    if (!accepted) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/staff", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed to remove staff (${res.status})`);

      setMessage("Staff removed.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to remove staff");
    } finally {
      setBusy(false);
    }
  }

  async function setStaffPassword(userId: string) {
    if (!accessToken) return;
    const nextPassword = window.prompt("Enter new password for this staff account (min 8 characters):", "");
    if (!nextPassword) return;
    if (nextPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, userId, password: nextPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as PatchStaffResponse;
      if (!res.ok) throw new Error(data?.error || `Failed to set password (${res.status})`);

      setMessage("Staff password updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to set password");
    } finally {
      setBusy(false);
    }
  }

  async function updateStaffRole(userId: string) {
    if (!accessToken) return;
    const role = roleDraftByUserId[userId];
    if (!role) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, userId, role }),
      });
      const data = (await res.json().catch(() => ({}))) as PatchStaffResponse;
      if (!res.ok) throw new Error(data?.error || `Failed to update role (${res.status})`);

      setMessage("Staff role updated.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-foreground/70">
          Staff members are limited to auditing flows (save draft, submit, and view reports).
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStaffModalOpen(true)}
            className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background"
            disabled={busy}
          >
            Add / Update staff
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-foreground/20 px-2 text-xs"
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {staffModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close staff modal"
            onClick={() => setStaffModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-lg border border-foreground/20 bg-background p-4 shadow-xl sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Add / Update staff</h3>
              <button
                type="button"
                className="h-8 rounded-md border border-foreground/20 px-2 text-xs"
                onClick={() => setStaffModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Staff name"
                className="h-10 rounded-md border border-foreground/20 bg-background px-3 text-sm"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@email.com"
                className="h-10 rounded-md border border-foreground/20 bg-background px-3 text-sm"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8)"
                className="h-10 rounded-md border border-foreground/20 bg-background px-3 text-sm"
              />
              <select
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value as AssignableRole)}
                className="h-10 rounded-md border border-foreground/20 bg-background px-3 text-sm"
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={addOrUpdateStaff}
                disabled={busy || !fullName.trim() || !email || password.length < 8}
                className="h-10 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save staff"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <div className="overflow-x-auto rounded-md border border-foreground/20">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="bg-foreground/[0.04] text-left">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Password</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t border-foreground/10">
                <td className="px-3 py-2">{r.fullName || "(name not set)"}</td>
                <td className="px-3 py-2">{r.email || "(email hidden)"}</td>
                <td className="px-3 py-2">{r.role}</td>
                <td className="px-3 py-2">{r.hasPin ? "Set" : "Not set"}</td>
                <td className="px-3 py-2">
                  {r.role === "ADMIN" ? (
                    <span className="text-xs text-foreground/60">Owner</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={roleDraftByUserId[r.userId] || "MEMBER"}
                        onChange={(e) =>
                          setRoleDraftByUserId((prev) => ({
                            ...prev,
                            [r.userId]: e.target.value as AssignableRole,
                          }))
                        }
                        className="h-8 rounded-md border border-foreground/20 bg-background px-2 text-xs"
                        disabled={busy}
                      >
                        {assignableRoles.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-foreground/20 px-2 text-xs"
                        onClick={() => updateStaffRole(r.userId)}
                        disabled={busy}
                      >
                        Update role
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-foreground/20 px-2 text-xs"
                        onClick={() => setStaffPassword(r.userId)}
                        disabled={busy}
                      >
                        Set password
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-red-300 px-2 text-xs text-red-700"
                        onClick={() => removeStaff(r.userId)}
                        disabled={busy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-foreground/60" colSpan={5}>No staff added yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
