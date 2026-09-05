"use client";

import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@/hooks/useChatStream";
import type { SourceChunk } from "@/lib/api";

function SourceChip({ source }: { source: SourceChunk }) {
  const similarity = source.similarity != null ? Math.round(source.similarity * 100) : null;
  return (
    <div className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-200">
      <span className="font-semibold">{source.episode_title}</span>
      {" · "}
      <span className="text-emerald-300">{source.guest_name}</span>
      {source.timestamp_ref ? ` · ${source.timestamp_ref}` : null}
      {similarity != null ? (
        <span className="ml-1.5 text-emerald-400">({similarity}% match)</span>
      ) : null}
    </div>
  );
}

export function MessageItem({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isStreamingEmpty = !isUser && message.content.length === 0;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isUser
            ? "bg-brand-600 text-white"
            : "bg-gradient-to-br from-amber-400 to-rose-500 text-slate-900"
        }`}
      >
        {isUser ? "You" : "LG"}
      </div>

      <div
        role={isUser ? undefined : "region"}
        aria-label={isUser ? undefined : "assistant message"}
        className={`max-w-[85%] min-w-0 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "rounded-tr-sm border-brand-600/40 bg-brand-600/15 text-slate-100"
            : "rounded-tl-sm border-slate-800 bg-slate-900/80 text-slate-200"
        }`}
      >
        {isStreamingEmpty ? (
          <span className="inline-flex items-center gap-1 text-slate-500" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:300ms]" />
          </span>
        ) : (
          <div className="markdown-body [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-bold [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-bold [&_strong]:text-slate-100 [&_a]:text-sky-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]">
            <ReactMarkdown>{message.content || "\u200b"}</ReactMarkdown>
          </div>
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-slate-800 pt-2">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Grounded in transcript
            </p>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((source, idx) => (
                <SourceChip key={`${source.episode_title}-${idx}`} source={source} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}