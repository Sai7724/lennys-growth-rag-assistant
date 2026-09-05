"use client";

import React, { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface SandboxedIframeProps {
  content: string;
  title: string;
  /** "html" (default) or "markdown" / "md" */
  type?: string;
}

export const SandboxedIframe: React.FC<SandboxedIframeProps> = ({
  content,
  title,
  type = "html",
}) => {
  const [loaded, setLoaded] = useState(false);

  const isMarkdown = type === "markdown" || type === "md";

  // Sanitize the raw HTML string via DOMPurify before mounting in the iframe.
  // Allow <style>, <script> and common attributes so interactive widgets work,
  // but strip event-handler attributes (onclick, etc.) and javascript: hrefs.
  const cleanHtml = useMemo(() => {
    if (isMarkdown) return "";
    return DOMPurify.sanitize(content, {
      WHOLE_DOCUMENT: true,
      ADD_TAGS: ["style", "link", "script"],
      ADD_ATTR: ["target", "href", "src", "class", "id"],
    });
  }, [content, isMarkdown]);

  // ── Markdown rendering path ──────────────────────────────────────────────
  if (isMarkdown) {
    return (
      <div className="h-full overflow-auto bg-neutral-950 px-6 py-5">
        <div className="prose prose-invert prose-sm max-w-none text-neutral-200
          [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-neutral-50 [&_h1]:mb-3 [&_h1]:mt-5
          [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-neutral-100 [&_h2]:mt-4 [&_h2]:mb-2
          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-neutral-200 [&_h3]:mt-3 [&_h3]:mb-1.5
          [&_p]:text-[14px] [&_p]:leading-relaxed [&_p]:mb-3
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3
          [&_strong]:font-semibold [&_strong]:text-neutral-50
          [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-600 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-400
          [&_code]:rounded [&_code]:bg-neutral-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:font-mono [&_code]:text-neutral-200
          [&_pre]:rounded-lg [&_pre]:bg-neutral-900 [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3
          [&_a]:text-blue-400 [&_a]:underline [&_a:hover]:text-blue-300
          [&_hr]:border-neutral-800 [&_hr]:my-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // ── HTML/sandboxed iframe rendering path ─────────────────────────────────
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Security badge */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800/60 bg-neutral-900/40 px-3 py-1.5">
        <span className="text-[10px] text-neutral-600">
          sandboxed · scripts enabled · no origin access
        </span>
        <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
          ✓ Isolated
        </span>
      </div>

      {!loaded && (
        <div className="flex h-10 shrink-0 items-center justify-center gap-2 bg-neutral-900/30 text-[11px] text-neutral-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Rendering…
        </div>
      )}

      <iframe
        title={title}
        srcDoc={cleanHtml}
        /**
         * SECURITY ISOLATION:
         * - allow-scripts: lets interactive widgets and charts run JS inside the iframe.
         * - allow-same-origin is intentionally OMITTED: the iframe runs in an opaque
         *   (null) origin, so scripts inside cannot reach parent cookies, localStorage,
         *   sessionStorage, or make credentialed requests to the parent domain.
         */
        sandbox="allow-scripts"
        onLoad={() => setLoaded(true)}
        className="w-full flex-1 border-none bg-white"
        aria-label={`Sandboxed preview: ${title}`}
      />
    </div>
  );
};
