"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export function useAutoSave({
  value,
  onSave,
  debounceMs = 2000,
}: {
  value: string;
  onSave: (value: string) => Promise<{ error?: string }>;
  debounceMs?: number;
}) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestValueRef = useRef(value);
  const savedValueRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (latestValueRef.current === savedValueRef.current) {
      setStatus("saved");
      return;
    }

    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    setStatus("saving");
    setErrorMessage(null);

    const valueToSave = latestValueRef.current;
    const result = await onSave(valueToSave);

    inFlightRef.current = false;

    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }

    savedValueRef.current = valueToSave;
    setStatus("saved");

    if (queuedRef.current || latestValueRef.current !== savedValueRef.current) {
      queuedRef.current = false;
      void flush();
    }
  }, [onSave]);

  useEffect(() => {
    latestValueRef.current = value;

    if (value === savedValueRef.current) {
      return;
    }

    setStatus("pending");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void flush();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, debounceMs, flush]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (latestValueRef.current !== savedValueRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return { status, errorMessage, flush };
}
