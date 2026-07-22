import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { ScreenState } from "../components/ui";
import { fmtDate } from "../lib/format";
import type { DirectMessage, DirectMessageThread } from "../lib/types";

function isMine(message: DirectMessage, userId?: string | null) {
  if (message.isAgent || message.fromAdmin) return false;
  if (userId && message.senderId) return message.senderId === userId;
  return !message.fromAdmin && !message.isAgent;
}

export function MessagesScreen() {
  const { api, user } = useAuth();
  const { theme } = useTheme();
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const [thread, setThread] = useState<DirectMessageThread | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sinceRef = useRef<string | undefined>(undefined);

  const mergeMessages = useCallback((prev: DirectMessage[], next: DirectMessage[]) => {
    const map = new Map<string, DirectMessage>();
    for (const m of prev) map.set(m.id, m);
    for (const m of next) map.set(m.id, m);
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, []);

  const load = useCallback(
    async (incremental = false) => {
      try {
        const data = await api.messages.getThread(incremental ? sinceRef.current : undefined);
        setThread((prev) => {
          if (!prev || !incremental) return data;
          return {
            ...data,
            messages: mergeMessages(prev.messages, data.messages),
          };
        });
        const last = data.messages[data.messages.length - 1];
        if (last) sinceRef.current = last.createdAt;
        setError(null);
      } catch (err) {
        if (!incremental) setError(err instanceof Error ? err.message : "Failed to load chat");
      } finally {
        setLoading(false);
      }
    },
    [api, mergeMessages],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  useEffect(() => {
    const id = setInterval(() => void load(true), 5000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!thread?.messages.length) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [thread?.messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await api.messages.send(body);
      setDraft("");
      setThread((prev) => {
        const extras = [res.message, ...(res.replies ?? [])];
        if (!prev) {
          return {
            userId: res.message.userId,
            messages: extras,
            unreadCount: 0,
            agentEnabled: res.agentEnabled,
            escalatedAt: res.escalated ? new Date().toISOString() : null,
          };
        }
        return {
          ...prev,
          agentEnabled: res.agentEnabled,
          messages: mergeMessages(prev.messages, extras),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function escalate() {
    try {
      const res = await api.messages.requestAdmin();
      setThread((prev) =>
        prev
          ? {
              ...prev,
              agentEnabled: res.agentEnabled,
              escalatedAt: new Date().toISOString(),
              messages: mergeMessages(prev.messages, [res.reply]),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Escalate failed");
    }
  }

  async function resumeAgent() {
    try {
      const res = await api.messages.resumeAgent();
      setThread((prev) =>
        prev
          ? {
              ...prev,
              agentEnabled: res.agentEnabled,
              escalatedAt: null,
              messages: mergeMessages(prev.messages, [res.reply]),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume failed");
    }
  }

  const messages = thread?.messages ?? [];
  const humanQueue = thread?.agentEnabled === false || Boolean(thread?.escalatedAt);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Support</Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
              {humanQueue ? "Human queue" : "Agent online"}
            </Text>
          </View>
          <Pressable onPress={() => void (humanQueue ? resumeAgent() : escalate())}>
            <Text style={{ color: theme.primary, fontWeight: "600", fontSize: 13 }}>
              {humanQueue ? "Chat with Agent" : "Speak to admin"}
            </Text>
          </Pressable>
        </View>

        <ScreenState
          loading={loading}
          error={error && messages.length === 0 ? error : null}
          onRetry={() => void load(false)}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = isMine(item, user?.id ?? thread?.userId);
              const label = item.isAgent ? "Agent" : item.fromAdmin ? "Admin" : "You";
              return (
                <View
                  style={[
                    styles.row,
                    { justifyContent: mine ? "flex-end" : "flex-start" },
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      mine
                        ? {
                            backgroundColor: theme.primary,
                            borderBottomRightRadius: 4,
                          }
                        : {
                            backgroundColor: theme.surface,
                            borderColor: theme.divider,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderBottomLeftRadius: 4,
                          },
                    ]}
                  >
                    {!mine ? (
                      <Text style={{ color: theme.muted, fontSize: 11, marginBottom: 4, fontWeight: "600" }}>
                        {label}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        color: mine ? theme.onPrimary : theme.text,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    >
                      {item.body}
                    </Text>
                    <Text
                      style={{
                        color: mine ? "rgba(255,255,255,0.65)" : theme.muted,
                        fontSize: 10,
                        marginTop: 6,
                        alignSelf: "flex-end",
                      }}
                    >
                      {fmtDate(item.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              !loading ? (
                <Text style={{ color: theme.muted, textAlign: "center", marginTop: 48, fontSize: 13 }}>
                  Message support to get started.
                </Text>
              ) : null
            }
          />
        </ScreenState>

        {error && messages.length > 0 ? (
          <Text style={{ color: theme.text, paddingHorizontal: 14, paddingBottom: 4, fontSize: 12 }}>
            {error}
          </Text>
        ) : null}

        <View style={[styles.composer, { borderTopColor: theme.divider, backgroundColor: theme.bg }]}>
          <View
            style={[
              styles.inputShell,
              { backgroundColor: theme.surface, borderColor: theme.divider },
            ]}
          >
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={theme.muted}
              multiline
              maxLength={2000}
            />
          </View>
          <Pressable
            onPress={() => void send()}
            disabled={sending || !draft.trim()}
            style={[
              styles.sendBtn,
              {
                backgroundColor: theme.primary,
                opacity: sending || !draft.trim() ? 0.45 : 1,
              },
            ]}
          >
            <Ionicons name="send" size={16} color={theme.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  list: { paddingHorizontal: 12, paddingVertical: 14, flexGrow: 1 },
  row: { flexDirection: "row", marginBottom: 8, paddingHorizontal: 4 },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputShell: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 40,
    maxHeight: 110,
    justifyContent: "center",
  },
  input: {
    fontSize: 14,
    lineHeight: 18,
    maxHeight: 96,
    paddingTop: Platform.OS === "ios" ? 6 : 2,
    paddingBottom: Platform.OS === "ios" ? 6 : 2,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
