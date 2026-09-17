"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; fallbackTitle?: string };
type State = { error: Error | null };

export class BlockchainErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[BlockchainDashboard]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass-card rounded-2xl border border-rose-500/30 p-8 text-center">
          <h2 className="text-lg font-semibold text-rose-300">
            {this.props.fallbackTitle ?? "Something went wrong"}
          </h2>
          <p className="mt-2 text-sm text-muted">{this.state.error.message}</p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
