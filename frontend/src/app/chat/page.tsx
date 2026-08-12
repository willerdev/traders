"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  Plus,
  Send,
} from "lucide-react";
import {
  api,
  type ChatConversation,
  type PeerChatMessage,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { syncApiAuthToken } from "@/stores/auth";

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

function PeerChatInner() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("c");

  const [inbox, setInbox] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [messages, setMessages] = useState<PeerChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [startEmail, setStartEmail] = useState("");
  const [startBody, setStartBody] = useState("");
  const [showStart, setShowStart] = useState(!initialId);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSyncRef = useRef<string | null>(null);

  const active = inbox.find((c) => c.id === activeId) ?? null;

  const loadInbox = useCallback(async () => {
    syncApiAuthToken();
    try {
      const rows = await api.chat.inbox();
      setInbox(rows);
      setActiveId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        if (initialId && rows.some((r) => r.id === initialId)) return initialId;
        return prev;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chats");
    } finally {
      setInboxLoading(false);
    }
  }, [initialId]);

  const mergeMessages = useCallback((incoming: PeerChatMessage[]) => {
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

  const loadMessages = useCallback(
    async (conversationId: string, incremental = false) => {
      syncApiAuthToken();
      if (!incremental) {
        setMessagesLoading(true);
        lastSyncRef.current = null;
      }
      try {
        const since = incremental ? lastSyncRef.current ?? undefined : undefined;
        const res = await api.chat.messages(conversationId, since);
        if (!incremental) {
          setMessages(res.messages ?? []);
          if (res.messages?.length) {
            lastSyncRef.current =
              res.messages[res.messages.length - 1].createdAt;
          }
        } else {
          mergeMessages(res.messages ?? []);
        }
        void loadInbox();
      } catch (e) {
        if (!incremental) {
          setError(e instanceof Error ? e.message : "Could not load messages");
        }
      } finally {
        setMessagesLoading(false);
      }
    },
    [loadInbox, mergeMessages],
  );

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeId, false);
    const handle = window.setInterval(() => {
      void loadMessages(activeId, true);
    }, 4000);
    return () => window.clearInterval(handle);
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function startChat() {
    setError(null);
    const email = startEmail.trim();
    if (!email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    const firstMessage = startBody.trim();
    if (!firstMessage) {
      setError("Write a first message to start the chat");
      return;
    }
    setStarting(true);
    try {
      const convo = await api.chat.start(email, firstMessage);
      setInbox((prev) => {
        const others = prev.filter((c) => c.id !== convo.id);
        return [convo, ...others];
      });
      setActiveId(convo.id);
      setShowStart(false);
      setStartEmail("");
      setStartBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setStarting(false);
    }
  }

  async function send() {
    if (!activeId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await api.chat.send(activeId, draft.trim());
      mergeMessages([msg]);
      setDraft("");
      void loadInbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Chat</h1>
          <p className="text-sm text-slate-400">
            Private messages with other traders — start by email
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setShowStart(true);
            setError(null);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New chat
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {showStart && (
        <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
          <p className="mb-2 text-sm text-slate-300">
            Start a conversation with a trader&apos;s account email
          </p>
          <div className="flex flex-col gap-2">
            <Input
              type="email"
              placeholder="trader@email.com"
              value={startEmail}
              onChange={(e) => setStartEmail(e.target.value)}
            />
            <Input
              placeholder="First message…"
              value={startBody}
              onChange={(e) => setStartBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void startChat();
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={starting}
                onClick={() => void startChat()}
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Start"
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowStart(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[280px_1fr]">
        <aside
          className={cn(
            "min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-[#0b1220]",
            activeId ? "hidden md:block" : "block",
          )}
        >
          {inboxLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : inbox.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
              No conversations yet
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {inbox.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-white/5",
                      activeId === c.id && "bg-white/10",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {c.peer.displayName}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="truncate text-xs text-slate-500">
                      {c.peer.email ?? "—"}
                    </span>
                    {c.lastMessage && (
                      <span className="truncate text-xs text-slate-400">
                        {c.lastMessage.body}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section
          className={cn(
            "flex min-h-0 flex-col rounded-xl border border-white/10 bg-[#0b1220]",
            !activeId && "hidden md:flex",
          )}
        >
          {!activeId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-500">
              <MessageCircle className="h-10 w-10 opacity-40" />
              <p className="text-sm">Select a chat or start a new one</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 md:hidden"
                  onClick={() => setActiveId(null)}
                  aria-label="Back to inbox"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {active?.peer.displayName ?? "Chat"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {active?.peer.email ?? ""}
                  </p>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {messagesLoading && messages.length === 0 ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">
                    No messages yet — say hello
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        m.mine ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                          m.mine
                            ? "bg-primary text-white"
                            : "bg-white/10 text-slate-100",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {m.body}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-[10px]",
                            m.mine ? "text-white/70" : "text-slate-500",
                          )}
                        >
                          {fmtTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <form
                className="flex gap-2 border-t border-white/10 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <Input
                  placeholder="Write a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={sending}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending || !draft.trim()}
                  aria-label="Send"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { ready } = useRequireAuth();
  if (!ready) return <AuthLoadingScreen />;
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <PeerChatInner />
    </Suspense>
  );
}
