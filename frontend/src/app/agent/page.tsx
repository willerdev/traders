"use client";

import { AgentPortal } from "@/components/agent/agent-portal";

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Agent</h1>
        <p className="mt-1 text-sm text-gray-400">
          Enter your agent code to process MoMo withdrawals, or apply to become
          an agent.
        </p>
      </div>
      <AgentPortal />
    </div>
  );
}
