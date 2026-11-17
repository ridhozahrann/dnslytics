import type { BenchmarkRunRecord, CustomResolver } from '../types/dns';

const HISTORY_KEY = 'dnslytics_history_v1';
const CUSTOM_RESOLVERS_KEY = 'dnslytics_custom_resolvers_v1';
const NEXTDNS_ID_KEY = 'dnslytics_nextdns_id_v1';
const THEME_KEY = 'dnslytics_theme_v1';

const MAX_HISTORY_ITEMS = 25;

export function loadHistory(): BenchmarkRunRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRunToHistory(run: BenchmarkRunRecord): BenchmarkRunRecord[] {
  const existing = loadHistory();
  // Strip raw sample arrays on older history items if storage gets large
  const compactRun: BenchmarkRunRecord = {
    ...run,
    results: run.results.map((r) => ({
      ...r,
      samples: r.samples.slice(0, 50),
      warmupSamples: r.warmupSamples.slice(0, 4),
    })),
  };
  const updated = [compactRun, ...existing].slice(0, MAX_HISTORY_ITEMS);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // Fallback: store fewer items if quota exceeded
    const trimmed = updated.slice(0, 8);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return existing;
    }
  }
  return updated;
}

export function deleteHistoryEntry(id: string): BenchmarkRunRecord[] {
  const updated = loadHistory().filter((item) => item.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function updateHistoryNetworkLabel(
  id: string,
  networkLabel: string | undefined,
): BenchmarkRunRecord[] {
  const updated = loadHistory().map((item) =>
    item.id === id ? { ...item, networkLabel } : item,
  );
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

export function loadCustomResolvers(): CustomResolver[] {
  try {
    const raw = localStorage.getItem(CUSTOM_RESOLVERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomResolvers(resolvers: CustomResolver[]): void {
  try {
    localStorage.setItem(CUSTOM_RESOLVERS_KEY, JSON.stringify(resolvers));
  } catch {
    // ignore
  }
}

export function loadSavedNextDnsId(): string {
  try {
    return localStorage.getItem(NEXTDNS_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNextDnsId(id: string, persist: boolean): void {
  try {
    if (persist && id.trim()) {
      localStorage.setItem(NEXTDNS_ID_KEY, id.trim());
    } else {
      localStorage.removeItem(NEXTDNS_ID_KEY);
    }
  } catch {
    // ignore
  }
}

export function loadTheme(): 'dark' | 'light' {
  try {
    const val = localStorage.getItem(THEME_KEY);
    return val === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}
