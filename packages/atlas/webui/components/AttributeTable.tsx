import * as React from "react";
import Link from "next/link";
import { getRecord } from "@a5c-ai/atlas";

function isLikelyId(v: string): boolean {
  if (typeof v !== "string") return false;
  if (v.length < 3 || v.length > 200) return false;
  return /^[a-z][a-z0-9-]*:/.test(v) && !!getRecord(v);
}

function renderValue(v: unknown, depth = 0): React.ReactNode {
  if (v == null) return <span className="text-muted-foreground italic">∅</span>;
  if (typeof v === "boolean") return <span>{String(v)}</span>;
  if (typeof v === "number") return <span className="tabular-nums">{v}</span>;
  if (typeof v === "string") {
    if (isLikelyId(v)) {
      return (
        <Link
          href={`/n/${encodeURIComponent(v)}`}
          className="font-mono text-xs text-primary hover:underline"
        >
          {v}
        </Link>
      );
    }
    return <span className="whitespace-pre-wrap break-words">{v}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground italic">[]</span>;
    return (
      <ul className="space-y-1 list-disc list-inside marker:text-muted-foreground">
        {v.map((item, i) => (
          <li key={i}>{renderValue(item, depth + 1)}</li>
        ))}
      </ul>
    );
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    return (
      <div className={`grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 ${depth > 0 ? "pl-3 border-l" : ""}`}>
        {entries.map(([k, val]) => (
          <React.Fragment key={k}>
            <div className="text-xs text-muted-foreground font-mono py-0.5">{k}</div>
            <div className="text-xs py-0.5">{renderValue(val, depth + 1)}</div>
          </React.Fragment>
        ))}
      </div>
    );
  }
  return <span>{String(v)}</span>;
}

export function AttributeTable({ attributes }: { attributes: Record<string, unknown> }) {
  const entries = Object.entries(attributes).filter(([k]) => !k.startsWith("_") && k !== "id");
  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No attributes.</div>;
  }
  return (
    <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <div className="text-muted-foreground font-mono text-xs pt-0.5">{k}</div>
          <div className="min-w-0">{renderValue(v)}</div>
        </React.Fragment>
      ))}
    </div>
  );
}
