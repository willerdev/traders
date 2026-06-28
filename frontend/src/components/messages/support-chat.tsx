"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Headphones,
  Loader2,
  MessageCircle,
  Send,
  UserRound,
} from "lucide-react";
import { api, type DirectMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function SupportChat() {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [escalated, setEscalated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSyncRef = useRef<string | null>(null);
  const shouldScrollRef = useRef(true);

  const mergeMessages = useCallback((incoming: DirectMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
    const latest = incoming.reduce((a, b) =>
      new Date(a.createdAt) > new Date(b.createdAt) ? a : b,
    );
    lastSyncRef.current = latest.createdAt;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      const thread = await api.messages.getThread();
      setMessages(thread.messages ?? []);
      setAgentEnabled(thread.agentEnabled ?? true);
      setEscalated(Boolean(thread.escalatedAt));
      if (thread.messages?.length) {
        lastSyncRef.current =
          thread.messages[thread.messages.length - 1].createdAt;
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const pollNew = useCallback(async () => {
    if (!lastSyncRef.current) return;
    try {
      const thread = await api.messages.getThread(lastSyncRef.current);
      if (thread.messages?.length) {
        mergeMessages(thread.messages);
        setAgentEnabled(thread.agentEnabled ?? true);
        setEscalated(Boolean(thread.escalatedAt));
      }
    } catch {
      /* silent poll */
    }
  }, [mergeMessages]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const timer = setInterval(() => void pollNew(), 4000);
    return () => clearInterval(timer);
  }, [pollNew]);

  useEffect(() => {
    if (shouldScrollRef.current) scrollToBottom();
  }, [messages, agentTyping, scrollToBottom]);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    shouldScrollRef.current = nearBottom;
  };

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setAgentTyping(agentEnabled && !escalated);
    shouldScrollRef.current = true;

    const optimisticId = `temp-${Date.now()}`;
    const optimistic: DirectMessage = {
      id: optimisticId,
      userId: "",
      senderId: "",
      senderRole: "TRADER",
      senderName: "You",
      body,
      readAt: null,
      createdAt: new Date().toISOString(),
      fromAdmin: false,
      isAgent: false,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setError(null);

    try {
      const result = await api.messages.send(body);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== optimisticId);
        const next = [...withoutTemp, result.message];
        if (result.replies?.length) next.push(...result.replies);
        return next.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
      lastSyncRef.current = result.replies?.length
        ? result.replies[result.replies.length - 1].createdAt
        : result.message.createdAt;
      setAgentEnabled(result.agentEnabled);
      setEscalated(Boolean(result.escalated));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(body);
      setError(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setSending(false);
      setAgentTyping(false);
    }
  }

  async function handleRequestAdmin() {
    if (escalating || !agentEnabled) return;
    setEscalating(true);
    setAgentTyping(true);
    shouldScrollRef.current = true;
    try {
      const result = await api.messages.requestAdmin();
      if (result.reply) mergeMessages([result.reply]);
      setAgentEnabled(false);
      setEscalated(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach admin queue");
    } finally {
      setEscalating(false);
      setAgentTyping(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-white/10 bg-background/80 px-4 py-3 backdrop-blur-md sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-lg font-semibold text-white sm:text-xl">
              <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
              Support
            </h1>
            <p className="mt-0.5 truncate text-xs text-gray-400 sm:text-sm">
              {agentEnabled && !escalated
                ? "Agent replies instantly · escalate anytime"
                : "Human admin queue · replies within 24h"}
            </p>
          </div>
          {agentEnabled && !escalated && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 gap-1.5 text-xs"
              disabled={escalating}
              onClick={() => void handleRequestAdmin()}
            >
              {escalating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Headphones className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Speak to admin</span>
              <span className="sm:hidden">Admin</span>
            </Button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
      >
        {initialLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center text-gray-500">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Bot className="h-7 w-7 text-primary" />
            </div>
            <p className="font-medium text-gray-300">Hi — I&apos;m Agent</p>
            <p className="mt-2 max-w-xs text-sm">
              Ask about setups, KYC, payouts, TP claims, or how TraderRank Pro
              works. Tap <strong className="text-gray-300">Speak to admin</strong>{" "}
              for a human anytime.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((msg) => {
              const isMine = !msg.fromAdmin;
              const isAgent = msg.isAgent;
              return (
                <div
                  key={msg.id}
                  className={cn("flex", isMine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[min(100%,20rem)] sm:max-w-[75%]",
                      isMine ? "items-end" : "items-start",
                    )}
                  >
                    {!isMine && (
                      <div className="mb-1 flex items-center gap-1.5 px-1">
                        {isAgent ? (
                          <Bot className="h-3 w-3 text-primary" />
                        ) : (
                          <UserRound className="h-3 w-3 text-gray-400" />
                        )}
                        <span
                          className={cn(
                            "text-[11px] font-medium",
                            isAgent ? "text-primary" : "text-gray-400",
                          )}
                        >
                          {msg.senderName}
                        </span>
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:px-4",
                        isMine
                          ? "rounded-br-md bg-primary text-white"
                          : isAgent
                            ? "rounded-bl-md border border-primary/20 bg-primary/10 text-gray-100"
                            : "rounded-bl-md bg-white/10 text-gray-100",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      <p
                        className={cn(
                          "mt-1.5 text-[10px]",
                          isMine ? "text-white/60" : "text-gray-500",
                        )}
                      >
                        {fmtTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {agentTyping && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-primary/20 bg-primary/10 px-4 py-3">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Compose */}
      <div className="shrink-0 border-t border-white/10 bg-background/90 px-3 py-3 backdrop-blur-md sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && (
          <p className="mb-2 text-center text-xs text-danger sm:text-sm">{error}</p>
        )}
        <form
          onSubmit={(e) => void handleSend(e)}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend(e);
              }
            }}
            placeholder="Message Agent…"
            maxLength={4000}
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <Button
            type="submit"
            disabled={sending || !draft.trim()}
            className="h-11 w-11 shrink-0 rounded-xl p-0"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
