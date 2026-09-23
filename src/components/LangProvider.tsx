"use client";
import { createContext, useContext, type ReactNode } from "react";

// The active language code is decided on the SERVER (from the cookie) and pushed
// into this context, so server-rendered HTML and client hydration always use
// the same translation — no hydration mismatches.
const LangCtx = createContext<string>("en");

export function LangProvider({ code, children }: { code: string; children: ReactNode }) {
  return <LangCtx.Provider value={code || "en"}>{children}</LangCtx.Provider>;
}

export function useLangCode(): string {
  return useContext(LangCtx);
}
