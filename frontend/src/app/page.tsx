"use client";

import { useEffect, useRef, useState } from "react";
import { ArtifactViewer } from "@/components/Artifact/ArtifactViewer";
import { ChatPane } from "@/components/Chat/ChatPane";
import { Sidebar } from "@/components/Sidebar";
import { useChatStream } from "@/hooks/useChatStream";

const DEFAULT_ARTIFACT_WIDTH = 460;
const MIN_ARTIFACT_WIDTH = 320;
const MAX_ARTIFACT_WIDTH = 760;

function clampArtifactWidth(w: number): number {
  return Math.min(MAX_ARTIFACT_WIDTH, Math.max(MIN_ARTIFACT_WIDTH, Math.round(w)));
}

export default function HomePage() {
  const {
    messages,
    sessions,
    artifacts,
    providers,
    isStreaming,
    status,
    sendMessage,
    stop,
    sessionId,
    provider,
    setProvider,
    mode,
    setMode,
    artifact,
    setArtifact,
    error,
    reset,
    loadSession,
    deleteSession,
    refreshModels,
    loadArtifact,
  } = useChatStream();

  const [artifactDismissed, setArtifactDismissed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Artifact pane width (px). Initialized after mount to avoid hydration
  // mismatch; remembered across sessions via localStorage.
  const [artifactWidth, setArtifactWidth] = useState(DEFAULT_ARTIFACT_WIDTH);
  const artifactWidthRef = useRef(DEFAULT_ARTIFACT_WIDTH);

  const setWidth = (w: number) => {
    const clamped = clampArtifactWidth(w);
    artifactWidthRef.current = clamped;
    setArtifactWidth(clamped);
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("artifact-width");
      if (saved) setWidth(parseInt(saved, 10));
    } catch {
      /* ignore */
    }
  }, []);

  // When a new artifact arrives (content length changes), re-open the pane.
  useEffect(() => {
    if (artifact) setArtifactDismissed(false);
  }, [artifact?.html.length]);

  // Show the pane when: we have an artifact AND the user hasn't collapsed it.
  const showArtifactPane = artifact !== null && !artifactDismissed;

  const closeSidebar = () => setSidebarOpen(false);

  // Drag-to-resize the artifact pane. The pane is anchored to the right, so
  // dragging the handle left grows it and dragging right shrinks it.
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = artifactWidthRef.current;

    const onMove = (ev: PointerEvent) => {
      setWidth(startW + (startX - ev.clientX));
    };
    const onUp = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      try {
        handle.releasePointerCapture(ev.pointerId);
        window.localStorage.setItem("artifact-width", String(artifactWidthRef.current));
      } catch {
        /* ignore */
      }
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-neutral-950">
      {/* ── Left: Session sidebar ── */}
      <Sidebar
        sessions={sessions}
        providers={providers}
        artifacts={artifacts}
        activeSessionId={sessionId}
        activeProvider={provider}
        open={sidebarOpen}
        onClose={closeSidebar}
        onNewChat={() => {
          reset();
          closeSidebar();
        }}
        onSelectSession={(id) => {
          loadSession(id);
          closeSidebar();
        }}
        onDeleteSession={(id) => {
          deleteSession(id);
          closeSidebar();
        }}
        onSelectArtifact={(id) => {
          loadArtifact(id);
          setArtifactDismissed(false);
          closeSidebar();
        }}
      />

      {/* ── Workspace: Chat (fills the rest) + Artifact (right, resizable) ── */}
      <div className="flex flex-1 min-w-0 h-full overflow-hidden">
        {/* Chat — fills remaining width, never overlaps the artifact */}
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          <ChatPane
            messages={messages}
            isStreaming={isStreaming}
            status={status}
            error={error}
            provider={provider}
            onProviderChange={setProvider}
            providers={providers}
            mode={mode}
            onModeChange={setMode}
            onSend={sendMessage}
            onStop={stop}
            onOpenSidebar={() => setSidebarOpen(true)}
            onRefreshProviders={refreshModels}
            artifact={artifact}
            artifactVisible={showArtifactPane}
            onOpenArtifact={() => setArtifactDismissed(false)}
          />
        </div>

        {/* Artifact pane — docked to the right, resizable via its left edge */}
        {showArtifactPane && (
          <>
            {/* Drag-to-resize handle on the pane's left edge */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize artifact panel"
              title="Drag to resize · double-click to reset"
              onPointerDown={onResizeStart}
              onDoubleClick={() => setWidth(DEFAULT_ARTIFACT_WIDTH)}
              className="group relative z-10 w-2.5 shrink-0 cursor-col-resize touch-none select-none"
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-neutral-800 transition-colors group-hover:bg-neutral-600 group-active:bg-neutral-500" />
            </div>

            <div
              className="flex-shrink-0 h-full overflow-hidden border-l border-neutral-800"
              style={{ width: artifactWidth }}
            >
              <ArtifactViewer
                artifact={artifact}
                isStreaming={isStreaming}
                onClose={() => setArtifactDismissed(true)}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}