"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary] Render failure", error, info.componentStack);
  }

  private reloadApp = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 text-foreground">
        <section className="w-full max-w-md rounded-xl border border-foreground/15 bg-background p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">The app needs to reload</h1>
          <p className="mt-2 text-sm text-foreground/70">
            The current screen stopped responding. Your saved offline data is unchanged.
          </p>
          <button
            type="button"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background"
            onClick={this.reloadApp}
          >
            Reload app
          </button>
        </section>
      </main>
    );
  }
}
