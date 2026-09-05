"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/hooks/useChatStream";
import type { Artifact, ChatMode, ProviderInfo, ProviderName } from "@/lib/api";
import { ChatBubble } from "./ChatBubble";
import { ModelSelector } from "./ModelSelector";

interface ChatPaneProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  status: string | null;
  error: string | null;
  provider: ProviderName;
  onProviderChange: (provider: ProviderName) => void;
  providers: ProviderInfo[];
  onRefreshProviders?: () => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onOpenSidebar: () => void;
  /** Current artifact, if any (used to show the "Open artifact" button). */
  artifact?: Artifact | null;
  /** Whether the artifact pane is currently visible. */
  artifactVisible?: boolean;
  /** Called when the user clicks "Open artifact" to re-expand the artifact pane. */
  onOpenArtifact?: () => void;
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function ArtifactIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

const SUGGESTIONS: { title: string; prompt: string }[] = [
  {
    title: "How did Airbnb optimize early retention?",
    prompt: "How did Airbnb optimize early retention?",
  },
  {
    title: "Which PLG loops worked for top SaaS companies?",
    prompt: "Which PLG loops worked for top SaaS companies?",
  },
  {
    title: "Draft a Ship 30 for 30 essay on pricing tiers",
    prompt: "Draft a Ship 30 for 30 essay on pricing tiers",
  },
  {
    title: "Show me an HTML widget to track my North Star metric",
    prompt: "Show me an HTML widget to track my North Star metric",
  },
];

export function ChatPane({
  messages,
  isStreaming,
  status,
  error,
  provider,
  onProviderChange,
  providers,
  onRefreshProviders,
  mode,
  onModeChange,
  onSend,
  onStop,
  onOpenSidebar,
  artifact,
  artifactVisible,
  onOpenArtifact,
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);

  // The hook seeds a welcome assistant message; anything beyond that is a real conversation.
  const isEmpty = messages.length === 1 && messages[0].role === "assistant";

  useEffect(() => {
    setMounted(true);
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, mounted]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [draft]);

  const submit = () => {
    if (!draft.trim() || isStreaming) return;
    onSend(draft);
    setDraft("");
  };

  const firstUserMessage = messages.find((m) => m.role === "user")?.content ?? "";
  const headerTitle = firstUserMessage
    ? firstUserMessage.length > 60
      ? `${firstUserMessage.slice(0, 60)}…`
      : firstUserMessage
    : "New Chat";

  // Show the re-open button when an artifact exists but the pane is collapsed.
  const showReopenArtifact = artifact !== null && !artifactVisible;

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Slim header once a conversation exists */}
      {!isEmpty && (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-800/70 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open sidebar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 md:hidden"
            >
              <MenuIcon />
            </button>
            <h2 className="truncate text-sm font-medium text-neutral-200">
              {headerTitle}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* "Open artifact" pill — visible when the artifact pane is collapsed */}
            {showReopenArtifact && onOpenArtifact && (
              <button
                type="button"
                onClick={onOpenArtifact}
                aria-label="Open artifact viewer"
                className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-0.5 text-[11px] text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100"
              >
                <ArtifactIcon />
                <span className="hidden sm:inline truncate max-w-[120px]">{artifact?.title ?? "Artifact"}</span>
                <span className="sm:hidden">View</span>
              </button>
            )}

            <span className="hidden shrink-0 rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-0.5 text-[11px] text-neutral-400 sm:inline-flex">
              {providers.find((p) => p.value === provider)?.model ?? provider} ·{" "}
              {mode === "ship30" ? "Ship 30 for 30" : "Standard QA"}
            </span>
          </div>
        </header>
      )}

      {error && (
        <div
          role="alert"
          className="shrink-0 border-b border-rose-900/60 bg-rose-950/50 px-4 py-2 text-xs text-rose-300"
        >
          ⚠️ {error}
        </div>
      )}

      {/* Message list / empty state */}
      <div
        ref={listRef}
        aria-live="polite"
        aria-label="Chat history"
        className="flex-1 overflow-y-auto"
      >
        {isEmpty ? (
          <div className="relative flex h-full flex-col items-center justify-center px-4 pb-16">
            {/* Mobile top bar */}
            <div className="absolute inset-x-0 top-0 flex items-center gap-2.5 border-b border-neutral-800/70 px-3 py-2.5 md:hidden">
              <button
                type="button"
                onClick={onOpenSidebar}
                aria-label="Open sidebar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100"
              >
                <MenuIcon />
              </button>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-bold text-white">
                LG
              </div>
              <span className="truncate text-sm font-semibold text-neutral-100">
                Lenny Growth Assistant
              </span>
            </div>

            <h1 className="mt-10 text-xl font-semibold tracking-tight text-neutral-100 sm:mt-0 sm:text-2xl">
              What can I help with?
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Grounded answers from 200+ hours of Lenny's Podcast
            </p>
            <div className="mt-10 grid w-full max-w-3xl gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  disabled={isStreaming}
                  onClick={() => onSend(s.prompt)}
                  className="group flex items-start justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3.5 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-900 disabled:opacity-50"
                >
                  <span className="text-[13px] leading-snug text-neutral-300 group-hover:text-neutral-100">
                    {s.title}
                  </span>
                  <svg className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:py-6">
            <div className="flex flex-col gap-6">
              {messages.map((message, idx) => {
                const isLastAssistant =
                  message.role === "assistant" &&
                  idx === messages.length - 1 &&
                  !isStreaming;
                return (
                  <ChatBubble
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    sources={message.sources}
                    isStreaming={isStreaming && message.role === "assistant" && message.content.length === 0}
                    status={isStreaming && message.role === "assistant" ? status : null}
                    onRegenerate={
                      isLastAssistant ? () => onSend(lastUserContentBefore(messages, idx)) : undefined
                    }
                  />
                );
              })}
              <div
                ref={(el) => {
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <footer className="shrink-0 px-4 pb-3 pt-2 sm:pb-4">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-neutral-700 bg-neutral-900 shadow-lg shadow-black/30 transition-colors focus-within:border-neutral-500">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={
                isEmpty
                  ? "Ask a growth question…"
                  : "Follow up or ask a new question…"
              }
              aria-label="Chat input"
              className="max-h-44 w-full resize-none bg-transparent px-3 pb-1 pt-3 text-[15px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none sm:px-4 sm:pt-3.5"
            />
            <div className="flex items-center justify-between gap-1 px-2 pb-2 sm:gap-2 sm:px-3 sm:pb-2.5">
              <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                <ModelSelector
                  provider={provider}
                  onProviderChange={onProviderChange}
                  providers={providers}
                  mode={mode}
                  onModeChange={onModeChange}
                  disabled={isStreaming}
                  onRefresh={onRefreshProviders}
                />
              </div>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  title="Stop generating"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-opacity hover:opacity-85"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!draft.trim()}
                  aria-label="Send message"
                  title="Send message"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-neutral-600">
            Enter to send · Shift+Enter for new line · Grounded in transcripts (similarity ≥ 0.55)
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Find the user message immediately preceding the assistant message at `index`. */
function lastUserContentBefore(messages: ChatMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}
