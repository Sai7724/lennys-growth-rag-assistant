"use client";

import React, { useState } from "react";
import type { Artifact } from "@/lib/api";
import { SandboxedIframe } from "./SandboxedIframe";

interface ArtifactViewerProps {
  artifact: Artifact | null;
  isStreaming: boolean;
  onClose: () => void;
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function typeLabel(type: string): string {
  if (type === "markdown" || type === "md") return "Markdown";
  if (type === "html") return "HTML";
  return type.toUpperCase();
}

function fileExtension(type: string): string {
  if (type === "markdown" || type === "md") return "md";
  return "html";
}

export function ArtifactViewer({ artifact, isStreaming, onClose }: ArtifactViewerProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  const isMarkdown = artifact?.type === "markdown" || artifact?.type === "md";

  const handleCopy = () => {
    if (!artifact) return;
    navigator.clipboard.writeText(artifact.html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!artifact) return;
    const ext = fileExtension(artifact.type);
    const blob = new Blob([artifact.html], {
      type: isMarkdown ? "text/markdown" : "text/html",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, "-").toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      aria-label="Artifact viewer"
      className="flex h-full w-full min-w-0 flex-col bg-neutral-950"
    >
      {/* ── Top bar ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2">
        {/* Collapse button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse artifact viewer"
          title="Collapse"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <CollapseIcon />
        </button>

        {/* Title + type badge */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-neutral-200">
            {artifact?.title ?? "Artifact"}
          </span>
          {artifact && (
            <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
              {typeLabel(artifact.type)}
            </span>
          )}
        </div>

        {/* Action buttons */}
        {artifact && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy source"
              title="Copy source"
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                copied
                  ? "border-emerald-700 bg-emerald-950/60 text-emerald-300"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
              }`}
            >
              <CopyIcon />
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              aria-label="Download artifact"
              title="Download"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200"
            >
              <DownloadIcon />
              Download
            </button>
          </div>
        )}
      </div>

      {/* ── Tab bar (only shown when artifact is present and not markdown) ── */}
      {artifact && !isMarkdown && (
        <div className="flex shrink-0 items-center gap-0.5 border-b border-neutral-800 bg-neutral-900/40 px-3 pt-1">
          {(["preview", "code"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? "border border-b-neutral-900 border-neutral-700 bg-neutral-950 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {tab === "preview" ? "Preview" : "Code"}
            </button>
          ))}
        </div>
      )}

      {/* ── Content area ── */}
      <div className="relative flex-1 overflow-hidden">
        {artifact ? (
          <>
            {/* Preview tab (or markdown viewer) */}
            <div
              className={`absolute inset-0 transition-opacity duration-150 ${
                activeTab === "preview" || isMarkdown ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
            >
              <SandboxedIframe
                key={`${artifact.title}-${artifact.html.length}`}
                content={artifact.html}
                title={artifact.title}
                type={artifact.type}
              />
            </div>

            {/* Code tab */}
            {!isMarkdown && (
              <div
                className={`absolute inset-0 overflow-auto transition-opacity duration-150 ${
                  activeTab === "code" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
              >
                <pre className="h-full overflow-auto bg-neutral-950 p-4 text-[12.5px] leading-relaxed text-neutral-300">
                  <code className="font-mono">{artifact.html}</code>
                </pre>
              </div>
            )}
          </>
        ) : isStreaming ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
            <p className="text-xs text-neutral-500">
              Waiting for the model to wrap its output in an{" "}
              <code className="rounded bg-neutral-900 px-1 text-neutral-400">&lt;artifact&gt;</code>{" "}
              tag…
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-2xl">
              🧩
            </div>
            <p className="text-sm font-medium text-neutral-400">No artifact yet</p>
            <p className="max-w-xs text-xs text-neutral-600">
              Ask for code, an HTML widget, a wireframe, or a strategic document and it will render
              here in a sandboxed preview.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
