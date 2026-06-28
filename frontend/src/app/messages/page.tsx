"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { api, type DirectMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MessagesPage() {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const thread = await api.messages.getThread();
      setMessages(thread.messages ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const msg = await api.messages.send(body);
      setMessages((prev) => [...prev, msg]);
      setDraft("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
            <MessageCircle className="h-8 w-8 text-primary" />
            Support chat
          </h1>
          <p className="mt-2 text-gray-400">
            Message the platform team directly — we typically reply within 24 hours.
          </p>
        </div>

        <div className="glass-card flex h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border border-white/10">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
                <MessageCircle className="mb-3 h-10 w-10 opacity-40" />
                <p>No messages yet.</p>
                <p className="mt-1 text-sm">Send a message if you need help with payouts, KYC, or your account.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.fromAdmin ? "justify-start" : "justify-end",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.fromAdmin
                        ? "rounded-bl-md bg-white/10 text-gray-100"
                        : "rounded-br-md bg-primary text-white",
                    )}
                  >
                    {msg.fromAdmin && (
                      <p className="mb-1 text-xs font-semibold text-primary">
                        {msg.senderName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        msg.fromAdmin ? "text-gray-500" : "text-white/70",
                      )}
                    >
                      {new Date(msg.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {error && (
            <p className="border-t border-white/5 px-4 py-2 text-sm text-danger">{error}</p>
          )}

          <form
            onSubmit={(e) => void handleSend(e)}
            className="flex gap-2 border-t border-white/10 p-4"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your message…"
              maxLength={4000}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary focus:outline-none"
            />
            <Button type="submit" disabled={sending || !draft.trim()} className="gap-1">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
