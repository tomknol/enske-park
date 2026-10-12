"use client";

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type GeocodeResult = {
  label: string;
  fullLabel: string;
  lat: number;
  lon: number;
};

type MapSearchControlProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: GeocodeResult) => void;
};

export function MapSearchControl({ open, onOpenChange, onSelect }: MapSearchControlProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => void search(query), 280);
    return () => window.clearTimeout(id);
  }, [query, open, search]);

  if (!open) {
    return (
      <button
        type="button"
        className="map-float-btn"
        aria-label="Zoek adres in Enschede"
        onClick={() => {
          setQuery("");
          setResults([]);
          onOpenChange(true);
        }}
      >
        <Search className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} aria-hidden />
      </button>
    );
  }

  return (
    <div
      className="map-search pointer-events-auto"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        closeSearch();
      }}
    >
      <div className="map-search-bar">
        <Search className="map-search-icon h-4 w-4 shrink-0 opacity-50" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          className="map-search-input"
          placeholder="Straat of adres in Enschede"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button
          type="button"
          className="map-search-close"
          aria-label="Zoeken sluiten"
          onClick={closeSearch}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {(loading || results.length > 0) && (
        <ul className="map-search-results" role="listbox">
          {loading && results.length === 0 && (
            <li className="map-search-result map-search-result--muted">Zoeken…</li>
          )}
          {results.map((r) => (
            <li key={`${r.lon},${r.lat}`}>
              <button
                type="button"
                className="map-search-result"
                role="option"
                onClick={() => {
                  onSelect(r);
                  closeSearch();
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
