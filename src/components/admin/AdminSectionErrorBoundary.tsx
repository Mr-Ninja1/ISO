"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AdminSectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[admin]", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-base font-semibold text-red-900">Admin console error</h2>
          <p className="mt-2 text-sm text-red-800">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <p className="mt-2 text-xs text-red-700/90">
            This is often caused by a lost connection mid-request. Reconnect and use Try again — your sign-in is
            unchanged.
          </p>
          <button
            type="button"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-red-900 px-4 text-sm font-medium text-white"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
