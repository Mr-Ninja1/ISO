"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

type Props = {
  userEmail?: string | null;
  onSignOut: () => void | Promise<void>;
  signingOut?: boolean;
};

export function AuthFlowHeader({ userEmail, onSignOut, signingOut }: Props) {
  return (
    <header className="py-4 px-4 sm:px-6 lg:px-8 border-b border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between h-10">
        <Link href="/login" className="flex items-center space-x-2">
          <span className="text-xl font-bold text-gray-800">ISO Grid</span>
        </Link>
        <nav className="flex items-center gap-4" aria-label="Account">
          {userEmail ? (
            <span className="text-sm font-medium text-gray-600 hidden sm:inline">
              {userEmail}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <LogOut className="h-4 w-4 mr-2" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </div>
    </header>
  );
}

