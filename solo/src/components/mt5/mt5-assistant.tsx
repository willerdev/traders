"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function Mt5Assistant({
  onActionsTaken,
}: {
  onActionsTaken?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I'm TradePro, your MT5 assistant. Ask about quotes, open trades, breakeven, partials, or say \"close all\" — I'll confirm before executing.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();
  }, [open, messages, sending]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setDraft("");
    setError(null);
    setSending(true);

    const userMsg: ChatMessage = { id: newId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await api.assistant.mt5Chat({
        message: text,
        history,
      });

      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: res.reply },
      ]);

      if (res.actionsTaken?.length) {
        onActionsTaken?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant unavailable");
    } finally {
      setSending(false);
    }
  }, [draft, sending, messages, onActionsTaken]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-[60] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95",
          "bg-primary text-white",
          open && "pointer-events-none opacity-0",
        )}
        style={{
          bottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px) + 0.25rem)",
          right: "1rem",
        }}
        aria-label="Open MT5 trading assistant"
      >
        <Sparkles className="h-6 w-6" strokeWidth={2} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/40 md:items-center md:justify-end md:p-4"
          role="dialog"
          aria-label="MT5 trading assistant"
        >
          <div
            className="mt-auto flex max-h-[min(85dvh,640px)] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--mt5-divider)] bg-[var(--mt5-surface)] text-[var(--mt5-text)] shadow-2xl md:max-w-md md:rounded-2xl"
            style={{ marginBottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex items-center justify-between border-b border-[var(--mt5-divider)] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">TradePro</p>
                  <p className="text-[10px] text-[var(--mt5-muted)]">
                    MT5 trading assistant
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "mb-3 flex",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-primary text-white"
                        : "bg-[var(--mt5-bg)] text-[var(--mt5-text)]",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="mb-3 flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-[var(--mt5-bg)] px-3 py-2 text-sm text-[var(--mt5-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking…
                  </div>
                </div>
              )}
              {error && (
                <p className="mb-2 text-xs text-[#ff5252]">{error}</p>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-[var(--mt5-divider)] p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask or command: close BTC, breakeven ETH…"
                  className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border border-[var(--mt5-divider)] bg-[var(--mt5-bg)] px-3 py-2 text-sm text-[var(--mt5-text)] placeholder:text-[var(--mt5-muted)] focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  disabled={sending || !draft.trim()}
                  onClick={() => void send()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white disabled:opacity-50"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
