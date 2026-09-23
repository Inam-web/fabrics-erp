"use client";
import { useMemo } from "react";
import { makeT } from "./i18n";
import { useLangCode } from "@/components/LangProvider";

// Translation hook. Language comes from the server-provided context, so SSR
// and client renders always agree (no hydration mismatch).
export function useT() {
  const code = useLangCode();
  return useMemo(() => makeT(code), [code]);
}
