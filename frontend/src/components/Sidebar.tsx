"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { PersistedArtifact, ProviderInfo, ProviderName, SessionSummary } from "@/lib/api";

function shortModelName(model: string): string {
  const base = model.includes("/") ? model.split("/").pop()! : model;
  const [name, tag] = base.split(":");
  return tag ? `${name.split("-")[0]}:${tag}` : name.split("-")[0];
}

interface SidebarProps {
  sessions: SessionSummary[];
  providers: ProviderInfo[];
  artifacts: PersistedArtifact[];
  activeSessionId: string | null;
  activeProvider: ProviderName;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onSelectArtifact: (artifactId: string) => void;
}

type GroupName = "Today" | "Yesterday" | "Previous 7 Days" | "Previous 30 Days" | "Older";

const GROUP_ORDER: GroupName[] = [
  "Today",
  "Yesterday",
  "Previous 7 Days",
  "Previous 30 Days",
  "Older",
];

function groupFor(session: SessionSummary): GroupName {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const last = new Date(session.last_message_at ?? session.created_at);
  const days = Math.floor(
    (startOfDay(new Date()).getTime() - startOfDay(last).getTime()) / 86_400_000
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 Days";
  if (days < 30) return "Previous 30 Days";
  return "Older";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Sidebar({
  sessions,
  providers,
  artifacts,
  activeSessionId,
  activeProvider,
  open,
  onClose,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onSelectArtifact,
}: SidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showArtifacts, setShowArtifacts] = useState(false);

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: sessions.filter((s) => groupFor(s) === group),
  })).filter((g) => g.items.length > 0);

  const active = providers.find((p) => p.value === activeProvider);

  // Close the kebab menu on outside click.
  useEffect(() => {
    if (!menuOpenId) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-kebab]")) setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpenId]);

  const handleKebab = (e: ReactMouseEvent, sessionId: string) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
    setMenuOpenId((id) => (id === sessionId ? null : sessionId));
  };

  const handleDelete = (e: ReactMouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirmDeleteId === sessionId) {
      setMenuOpenId(null);
      setConfirmDeleteId(null);
      onDeleteSession(sessionId);
    } else {
      setConfirmDeleteId(sessionId);
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Brand row */}
        <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
            LG
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight text-neutral-100">
              Lenny Growth Assistant
            </h1>
            <p className="truncate text-[11px] text-neutral-500">
              Grounded in podcast transcripts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200 md:hidden"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
          >
            <svg className="h-4 w-4 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New chat
          </button>
        </div>

        {/* Toggle between conversations and artifacts */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
            <button
              type="button"
              onClick={() => setShowArtifacts(false)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                !showArtifacts ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Chats
            </button>
            <button
              type="button"
              onClick={() => setShowArtifacts(true)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                showArtifacts ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Artifacts
            </button>
          </div>
        </div>

        {/* Search conversations */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 focus-within:border-neutral-600">
            <svg className="h-3.5 w-3.5 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search conversations…"
              aria-label="Search conversations"
              className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Conversation history */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {!showArtifacts ? (
            <>
              {grouped.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-neutral-500">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3.75h9m-9 3.75h4.5M3.75 4.5h16.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75V5.25a.75.75 0 01.75-.75z" />
                    </svg>
                  </div>
                  <p className="text-xs text-neutral-500">No conversations yet</p>
                  <p className="text-[11px] text-neutral-600">Ask a question to start a chat</p>
                </div>
              ) : (
                grouped.map(({ group, items }) => (
                  <div key={group}>
                    <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-neutral-600">
                      {group}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {items.map((session) => {
                        const active = session.id === activeSessionId;
                        const menuOpen = menuOpenId === session.id;
                        return (
                          <div
                            key={session.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectSession(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectSession(session.id);
                              }
                            }}
                            aria-current={active ? "true" : undefined}
                            className={`group relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                              active ? "bg-neutral-800" : "hover:bg-neutral-900"
                            }`}
                          >
                            <svg className="h-4 w-4 shrink-0 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                            </svg>
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-xs ${active ? "font-medium text-neutral-100" : "text-neutral-300"}`}>
                                {session.title === "New Growth Chat" ? "New chat" : session.title}
                              </p>
                              <p className="text-[10px] text-neutral-600">
                                {timeAgo(session.last_message_at ?? session.created_at)}
                              </p>
                            </div>

                            {/* Kebab menu trigger */}
                            <button
                              type="button"
                              data-kebab
                              aria-label={`Options for ${session.title}`}
                              aria-expanded={menuOpen}
                              onClick={(e) => handleKebab(e, session.id)}
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 ${
                                active || menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                              }`}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                              </svg>
                            </button>

                            {/* Kebab menu */}
                            {menuOpen && (
                              <div
                                data-kebab
                                className="absolute right-2 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl shadow-black/60"
                              >
                                <button
                                  type="button"
                                  onClick={(e) => handleDelete(e, session.id)}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                                    confirmDeleteId === session.id
                                      ? "bg-rose-950 font-semibold text-rose-300"
                                      : "text-neutral-300 hover:bg-neutral-800"
                                  }`}
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                  {confirmDeleteId === session.id ? "Confirm delete?" : "Delete conversation"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <>
              {/* Artifacts list */}
              {artifacts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-neutral-500">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <p className="text-xs text-neutral-500">No artifacts yet</p>
                  <p className="text-[11px] text-neutral-600">Ask for code or widgets to generate artifacts</p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectArtifact(artifact.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectArtifact(artifact.id);
                        }
                      }}
                      className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-900"
                    >
                      <svg className="h-4 w-4 shrink-0 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-neutral-300 group-hover:text-neutral-100">
                          {artifact.title}
                        </p>
                        <p className="text-[10px] text-neutral-600">
                          {artifact.artifact_type} · {timeAgo(artifact.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2.5 border-t border-neutral-800 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-semibold text-neutral-300">
            {active ? active.label[0] : activeProvider[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-neutral-300">
              {active ? `${active.label} · ${shortModelName(active.model)}` : activeProvider}
            </p>
          </div>
          <button
            type="button"
            aria-label="Settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}