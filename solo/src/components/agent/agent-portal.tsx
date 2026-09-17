"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type AgentMomoJob, type CashAgentProfile } from "@/lib/api";
import { Loader2 } from "lucide-react";

const AGENT_TOKEN_KEY = "trp-agent-token";

function readAgentToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AGENT_TOKEN_KEY);
}

function writeAgentToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(AGENT_TOKEN_KEY, token);
  else localStorage.removeItem(AGENT_TOKEN_KEY);
}

export function AgentPortal() {
  const [mode, setMode] = useState<"gate" | "queue">("gate");
  const [tab, setTab] = useState<"code" | "apply">("code");
  const [token, setToken] = useState<string | null>(null);
  const [agent, setAgent] = useState<CashAgentProfile | null>(null);
  const [jobs, setJobs] = useState<AgentMomoJob[]>([]);
  const [code, setCode] = useState("");
  const [applyName, setApplyName] = useState("");
  const [applyPhone, setApplyPhone] = useState("");
  const [applyEmail, setApplyEmail] = useState("");
  const [applyNote, setApplyNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmFile, setConfirmFile] = useState<File | null>(null);

  const loadQueue = useCallback(async (agentToken: string) => {
    const [me, list] = await Promise.all([
      api.agents.me(agentToken),
      api.agents.listJobs(agentToken),
    ]);
    setAgent(me);
    setJobs(list);
    setMode("queue");
  }, []);

  useEffect(() => {
    const existing = readAgentToken();
    if (!existing) {
      setLoading(false);
      return;
    }
    setToken(existing);
    void loadQueue(existing)
      .catch(() => {
        writeAgentToken(null);
        setToken(null);
        setMode("gate");
      })
      .finally(() => setLoading(false));
  }, [loadQueue]);

  async function unlock() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await api.agents.openSession(code);
      writeAgentToken(res.token);
      setToken(res.token);
      setAgent(res.agent);
      setMessage("Portal unlocked — check your email.");
      await loadQueue(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        displayName: applyName,
        phone: applyPhone || undefined,
        email: applyEmail || undefined,
        note: applyNote || undefined,
      };
      const res = api.getToken()
        ? await api.agents.applyMe(payload)
        : await api.agents.apply(payload);
      setMessage(res.message);
      setTab("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Application failed");
    } finally {
      setBusy(false);
    }
  }

  async function claim(id: string) {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await api.agents.claimJob(token, id);
      setMessage("Claimed — send MoMo to the number, then upload proof.");
      await loadQueue(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend() {
    if (!token || !confirmId || !confirmFile) {
      setError("Choose a screenshot of the MoMo transfer");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.agents.confirmJob(token, confirmId, confirmFile);
      setMessage("Sent confirmed — user will be notified by email.");
      setConfirmId(null);
      setConfirmFile(null);
      await loadQueue(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    writeAgentToken(null);
    setToken(null);
    setAgent(null);
    setJobs([]);
    setMode("gate");
    setMessage("Signed out of agent portal.");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      </div>
    );
  }

  if (mode === "gate") {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={tab === "code" ? "default" : "secondary"}
            onClick={() => setTab("code")}
          >
            Enter agent code
          </Button>
          <Button
            type="button"
            variant={tab === "apply" ? "default" : "secondary"}
            onClick={() => setTab("apply")}
          >
            Become an agent
          </Button>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {message}
          </p>
        )}

        {tab === "code" ? (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-gray-400">
              Enter the code you received after approval to see MoMo withdrawal
              requests and process payouts.
            </p>
            <input
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-lg tracking-[0.2em] text-white uppercase outline-none focus:border-sky-400"
              placeholder="AGENT CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
            />
            <Button
              type="button"
              className="w-full"
              disabled={busy || code.trim().length < 4}
              onClick={() => void unlock()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-gray-400">
              Apply to process MoMo withdrawals for users. After approval you
              receive an agent code by email.
            </p>
            <input
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-sky-400"
              placeholder="Full name"
              value={applyName}
              onChange={(e) => setApplyName(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-sky-400"
              placeholder="MoMo phone"
              value={applyPhone}
              onChange={(e) => setApplyPhone(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-sky-400"
              placeholder="Email"
              type="email"
              value={applyEmail}
              onChange={(e) => setApplyEmail(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-sky-400"
              placeholder="Why you want to become an agent (optional)"
              rows={3}
              value={applyNote}
              onChange={(e) => setApplyNote(e.target.value)}
            />
            <Button
              type="button"
              className="w-full"
              disabled={busy || applyName.trim().length < 2}
              onClick={() => void apply()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Submit application"
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400">Signed in as</p>
          <p className="font-medium text-white">{agent?.displayName}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={signOut}>
          Lock portal
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {message}
        </p>
      )}

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-50">
        Claim a request → send the UGX amount to the phone via MoMo → upload the
        transfer screenshot to confirm.
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-gray-400">No open MoMo withdrawals right now.</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium text-white">
                    {job.recipientName || "User"}
                  </p>
                  <p className="text-lg font-semibold tracking-wide text-emerald-300">
                    {job.momoPhone}
                  </p>
                  <p className="text-xs text-gray-400">{job.momoNetwork}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-white">
                    UGX {Math.round(job.amountUgx).toLocaleString("en-UG")}
                  </p>
                  <p className="text-xs text-gray-400">
                    ${job.amountUsdt.toFixed(2)} USDT · {job.status}
                    {job.mine ? " · yours" : ""}
                  </p>
                </div>
              </div>

              {!job.mine && !job.agentId && (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void claim(job.id)}
                >
                  Claim &amp; process
                </Button>
              )}

              {(job.mine || job.agentId) && (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  {confirmId === job.id ? (
                    <>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          setConfirmFile(e.target.files?.[0] ?? null)
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || !confirmFile}
                          onClick={() => void confirmSend()}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Confirm sent"
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setConfirmId(null);
                            setConfirmFile(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setConfirmId(job.id);
                        setConfirmFile(null);
                        if (!job.mine) void claim(job.id);
                      }}
                    >
                      Upload proof &amp; confirm
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
