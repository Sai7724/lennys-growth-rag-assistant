"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_URL,
  createSession,
  deleteSession as deleteSessionRequest,
  extractArtifact,
  getArtifact,
  getModels,
  getSessionMessages,
  listArtifacts,
  listSessions,
  streamChat,
  type Artifact,
  type ChatMode,
  type PersistedArtifact,
  type ProviderInfo,
  type ProviderName,
  type SessionSummary,
  type SourceChunk,
} from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
}

function useMessageId() {
  const ref = useRef(0);
  return useCallback(() => `msg-${++ref.current}-${Date.now()}`, []);
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "👋 Hey! I'm the Lenny Growth Assistant.",
};

export function useChatStream() {
  const nextId = useMessageId();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [artifacts, setArtifacts] = useState<PersistedArtifact[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [provider, setProvider] = useState<ProviderName>("ollama");
  const [mode, setMode] = useState<ChatMode>("default");
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamDoneRef = useRef(false);

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch {
      // Sidebar degrades gracefully when the backend is unreachable.
    }
  }, []);

  const refreshModels = useCallback(() => {
    getModels()
      .then((m) => {
        setProviders(m.providers);
        // If current provider is now available (key was just added), keep it.
        // If the default changed, respect it only if user hasn't picked one yet.
      })
      .catch(() => { /* degrade gracefully */ });
  }, []);

  const refreshArtifacts = useCallback(() => {
    listArtifacts()
      .then((a) => setArtifacts(a))
      .catch(() => { /* degrade gracefully */ });
  }, []);

  const loadArtifact = useCallback(async (artifactId: string) => {
    try {
      const persisted = await getArtifact(artifactId);
      setArtifact({
        type: persisted.artifact_type,
        title: persisted.title,
        html: persisted.content,
      });
    } catch {
      setError("Could not load this artifact.");
    }
  }, []);

  // Create a session once on mount and load the sidebar conversation list.
  useEffect(() => {
    let cancelled = false;
    createSession()
      .then((s) => {
        if (!cancelled) setSessionId(s.id);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            `Could not reach the backend at ${API_URL}. Is \`docker compose up\` running?`
          );
        }
      });
    refreshSessions();
    refreshModels();
    refreshArtifacts();
    return () => {
      cancelled = true;
    };
  }, [refreshSessions, refreshModels, refreshArtifacts]);

  // Re-fetch models whenever the browser tab regains focus (e.g. after
  // editing .env and restarting the backend in another window).
  useEffect(() => {
    window.addEventListener("focus", refreshModels);
    return () => window.removeEventListener("focus", refreshModels);
  }, [refreshModels]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;

      const userMsg: ChatMessage = { id: nextId(), role: "user", content: trimmed };
      const assistantId = nextId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);
      // Clear stale artifact for plain QA; generation requests will populate it fresh.
      if (!trimmed.match(/\b(html|widget|code|build|create|generate|make|write|design|draft|template|script|component|dashboard|chart|graph|visuali[sz]e|artifact|snippet)\b/i)) {
        setArtifact(null);
      }
      setStatus("Searching Lenny's transcript archive for relevant insights…");
      streamDoneRef.current = false;

      const controller = new AbortController();
      abortRef.current = controller;

      let acc = "";
      try {
        if (!sessionId) {
          setError("Session not ready. Please wait or refresh.");
          return;
        }
        await streamChat({
          sessionId,
          message: trimmed,
          mode,
          provider,
          signal: controller.signal,
          onStatus: (s) => setStatus(s),
          onDone: () => {
            streamDoneRef.current = true;
          },
          onSources: (sources) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, sources } : m))
            );
          },
          onToken: (token) => {
            acc += token;
            const { artifact: parsed, clean } = extractArtifact(acc);
            if (parsed) setArtifact(parsed);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: clean } : m
              )
            );
          },
          onError: (message) => {
            acc += (acc ? "\n\n" : "") + message;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: acc } : m
              )
            );
          },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const suffix = acc ? `\n\n` : "";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: acc + suffix + `[Stopped: ${message}]` }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        setStatus(null);
        abortRef.current = null;
        // Keep the sidebar in sync (new title, message count, last activity).
        refreshSessions();
      }
    },
    [sessionId, isStreaming, mode, provider, refreshSessions, nextId]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setArtifact(null);
    setStatus(null);
    setError(null);
    setSessionId(null);
    createSession()
      .then((s) => setSessionId(s.id))
      .catch(() => {
        setError(`Could not reach the backend at ${API_URL}. Is \`docker compose up\` running?`);
      })
      .finally(() => refreshSessions());
  }, [refreshSessions]);

  const loadSession = useCallback(
    async (targetId: string) => {
      if (isStreaming || targetId === sessionId) return;
      setError(null);
      setStatus(null);
      try {
        const stored = await getSessionMessages(targetId);
        setSessionId(targetId);
        setMessages(
          stored.map((m) => ({
            id: `srv-${m.id}`,
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            content: m.content,
            sources: m.sources ?? undefined,
          }))
        );
        // Re-hydrate the artifact pane from persisted artifacts (preferred) or extract from content.
        const lastArtifact = stored.reduceRight<Artifact | null>((found, m) => {
          if (found) return found;
          // First check for persisted artifacts
          if (m.artifacts && m.artifacts.length > 0) {
            const last = m.artifacts[m.artifacts.length - 1];
            return {
              type: last.artifact_type,
              title: last.title,
              html: last.content,
            };
          }
          // Fallback to extraction from content
          const { artifact } = extractArtifact(m.content ?? "");
          return artifact ?? null;
        }, null);
        setArtifact(lastArtifact);
      } catch {
        setError("Could not load this conversation.");
      }
    },
    [isStreaming, sessionId]
  );

  const deleteSession = useCallback(
    async (targetId: string) => {
      try {
        await deleteSessionRequest(targetId);
      } catch {
        setError("Could not delete this conversation.");
        return;
      }
      if (targetId === sessionId) {
        // The active conversation was removed — start a fresh chat.
        reset();
      } else {
        refreshSessions();
      }
    },
    [sessionId, reset, refreshSessions]
  );

  return {
    messages,
    sessions,
    artifacts,
    providers,
    isStreaming,
    status,
    sendMessage,
    stop,
    provider,
    setProvider,
    mode,
    setMode,
    artifact,
    setArtifact,
    error,
    reset,
    sessionId,
    loadSession,
    deleteSession,
    refreshSessions,
    refreshModels,
    refreshArtifacts,
    loadArtifact,
  };
}