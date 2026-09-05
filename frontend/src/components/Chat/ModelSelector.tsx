"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatMode, ProviderInfo, ProviderName } from "@/lib/api";

interface ModelSelectorProps {
  provider: ProviderName;
  onProviderChange: (provider: ProviderName) => void;
  providers: ProviderInfo[];
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  disabled?: boolean;
  onRefresh?: () => void;
}

const MODES: { value: ChatMode; label: string; hint: string }[] = [
  { value: "default", label: "Standard QA",    hint: "Grounded answers from transcripts" },
  { value: "ship30",  label: "Ship 30 for 30", hint: "Publication-ready essay format" },
];

function shortModelName(model: string): string {
  const base = model.includes("/") ? model.split("/").pop()! : model;
  const [name, tag] = base.split(":");
  return tag ? `${name.split("-")[0]}:${tag}` : name.split("-")[0];
}

function ChevronDown() {
  return (
    <svg className="h-3 w-3 shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-neutral-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

interface PortalDropdownProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}

/** Renders the dropdown at the document root to avoid overflow/clip issues. */
function PortalDropdown({ open, anchorRef, onClose, children }: PortalDropdownProps) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setCoords({
      top: rect.top + window.scrollY,   // above the anchor
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: coords.top - 8,   // 8px gap above anchor
        left: coords.left,
        minWidth: 220,
        transform: "translateY(-100%)",
        zIndex: 9999,
      }}
      className="rounded-xl border border-neutral-700 bg-neutral-900 py-1.5 shadow-2xl shadow-black/70"
    >
      {children}
    </div>,
    document.body
  );
}

export function ModelSelector({
  provider,
  onProviderChange,
  providers,
  mode,
  onModeChange,
  disabled,
  onRefresh,
}: ModelSelectorProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const skillBtnRef = useRef<HTMLButtonElement>(null);

  const activeProvider = providers.find((p) => p.value === provider);
  const activeMode = MODES.find((m) => m.value === mode)!;

  const triggerClass =
    "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-300 " +
    "transition-colors hover:bg-neutral-800 hover:text-neutral-100 " +
    "disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex items-center gap-0.5 text-xs">
      {/* ── Model trigger ── */}
      <button
        ref={modelBtnRef}
        type="button"
        disabled={disabled}
        onClick={() => { setModelOpen((o) => !o); setSkillOpen(false); }}
        aria-haspopup="listbox"
        aria-expanded={modelOpen}
        className={triggerClass}
      >
        <span>
          {activeProvider ? activeProvider.label : provider}
          {activeProvider && (
            <span className="hidden sm:inline text-neutral-500">
              {" · "}{shortModelName(activeProvider.model)}
            </span>
          )}
        </span>
        <ChevronDown />
      </button>

      <PortalDropdown open={modelOpen} anchorRef={modelBtnRef} onClose={() => setModelOpen(false)}>
        <div className="flex items-center justify-between px-3 pb-1.5 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Model</span>
          {onRefresh && (
            <button
              type="button"
              title="Refresh"
              onClick={() => { setRefreshing(true); onRefresh(); setTimeout(() => setRefreshing(false), 800); }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
            >
              <svg className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Refresh
            </button>
          )}
        </div>
        {(providers.length
          ? providers
          : [{ value: provider, label: provider, model: provider, local: false, available: true }] as ProviderInfo[]
        ).map((p) => (
          <button
            key={p.value}
            type="button"
            disabled={!p.available}
            onClick={() => { onProviderChange(p.value); setModelOpen(false); }}
            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              {p.value === provider && <CheckIcon />}
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-medium text-neutral-100">{p.label}</span>
              <span className="block text-[11px] text-neutral-500">
                {p.model}{p.local ? " · local" : ""}
                {!p.available ? " · no API key" : ""}
              </span>
            </span>
          </button>
        ))}
      </PortalDropdown>

      <span className="text-neutral-700 select-none">·</span>

      {/* ── Skill trigger ── */}
      <button
        ref={skillBtnRef}
        type="button"
        disabled={disabled}
        onClick={() => { setSkillOpen((o) => !o); setModelOpen(false); }}
        aria-haspopup="listbox"
        aria-expanded={skillOpen}
        className={triggerClass}
      >
        <span>{activeMode.label}</span>
        <ChevronDown />
      </button>

      <PortalDropdown open={skillOpen} anchorRef={skillBtnRef} onClose={() => setSkillOpen(false)}>
        <div className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Skill
        </div>
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => { onModeChange(m.value); setSkillOpen(false); }}
            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-neutral-800"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              {m.value === mode && <CheckIcon />}
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-medium text-neutral-100">{m.label}</span>
              <span className="block text-[11px] text-neutral-500">{m.hint}</span>
            </span>
          </button>
        ))}
      </PortalDropdown>
    </div>
  );
}
