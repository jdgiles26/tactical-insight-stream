import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "seen_items_v1";
const MAX_STORED = 500;

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistSeen(seen: Set<string>) {
  const arr = Array.from(seen).slice(-MAX_STORED);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

/**
 * Tracks which item IDs the user has "seen" (scrolled past / viewed).
 * Items not yet seen get a visual NEW indicator.
 */
export function useSeenItems() {
  const [seen, setSeen] = useState<Set<string>>(loadSeen);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persistSeen(next);
      return next;
    });
  }, []);

  const markAllSeen = useCallback((ids: string[]) => {
    setSeen((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      if (!changed) return prev;
      persistSeen(next);
      return next;
    });
  }, []);

  const isNew = useCallback(
    (id: string) => !seen.has(id),
    [seen]
  );

  return { markSeen, markAllSeen, isNew };
}

/**
 * IntersectionObserver-based hook that calls onVisible(id) when
 * a row scrolls into view. Attach the returned ref to the scroll container.
 */
export function useVisibilityTracker(onVisible: (id: string) => void) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.itemId;
            if (id) onVisible(id);
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      observerRef.current?.disconnect();
    };
  }, [onVisible]);

  const observe = useCallback((el: HTMLElement | null) => {
    if (el && observerRef.current) {
      observerRef.current.observe(el);
    }
  }, []);

  const unobserve = useCallback((el: HTMLElement | null) => {
    if (el && observerRef.current) {
      observerRef.current.unobserve(el);
    }
  }, []);

  return { observe, unobserve };
}
