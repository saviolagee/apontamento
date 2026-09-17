"use client";

/**
 * Estado do cronômetro guardado no localStorage: sobrevive a recarregar a
 * página e é compartilhado entre abas. Exposto como "external store" para o
 * React (useSyncExternalStore), evitando setState dentro de efeitos.
 */
export type TimerState = {
  /** Segundos acumulados antes da retomada atual. */
  elapsed: number;
  /** Momento (ms) do início/retomada; null = pausado. */
  startedAt: number | null;
  contractId: string;
  activityId: string;
  description: string;
};

export const EMPTY_TIMER: TimerState = {
  elapsed: 0,
  startedAt: null,
  contractId: "",
  activityId: "",
  description: "",
};

const STORAGE_KEY = "apontamento:cronometro";
const listeners = new Set<() => void>();

export function subscribeTimer(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Snapshot estável: a string crua do localStorage. */
export function getTimerSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function getTimerServerSnapshot(): string {
  return "";
}

export function parseTimer(raw: string): TimerState {
  if (!raw) return EMPTY_TIMER;
  try {
    return { ...EMPTY_TIMER, ...(JSON.parse(raw) as Partial<TimerState>) };
  } catch {
    return EMPTY_TIMER;
  }
}

export function saveTimer(next: TimerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sem localStorage: o cronômetro vale só para esta aba.
  }
  listeners.forEach((listener) => listener());
}
