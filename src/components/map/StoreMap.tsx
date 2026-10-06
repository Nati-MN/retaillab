"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Cite, Notice, Tag } from "@/components/ui";
import { GROWTH_CLASS_META, type GrowthClass } from "@/lib/analytics/mapMarkers";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { MAP_LAYERS, type MapLayerKey, type MapPlace, type MapStore } from "./types";

export interface StoreMapProps {
  tileUrl: string;
  attribution: string;
  maxZoom: number;
  stores: MapStore[];
  places: MapPlace[];
  /** e.g. "September 2026" — the month the marker size refers to. */
  monthLabel: string | null;
  sizeLegend: { diameter: number; label: string }[];
}

const RING: Record<GrowthClass, string> = {
  growing: "border-[3px] border-solid border-pos",
  stable: "border-[3px] border-double border-ink",
  declining: "border-[3px] border-dashed border-neg",
  unknown: "border-2 border-dotted border-ink-3",
};

const PLACES_MIN_ZOOM = 11;

function cssColor(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `rgb(${v.split(/\s+/).join(",")})`;
}

type Selection = { kind: "store"; id: string } | { kind: "place"; id: string } | null;

export function StoreMap({ tileUrl, attribution, maxZoom, stores, places, monthLabel, sizeLegend }: StoreMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [enabled, setEnabled] = useState<Set<MapLayerKey>>(() => new Set<MapLayerKey>(["COMPETITOR"]));
  const [tiles, setTiles] = useState<"pending" | "ok" | "failed">("pending");
  const [mapError, setMapError] = useState<string | null>(null);
  // Places sit within a few km of a store; at country zoom they would pile up on the store marker.
  const [zoomedIn, setZoomedIn] = useState(false);

  const located = useMemo(() => stores.filter((s) => s.latitude !== null && s.longitude !== null), [stores]);
  const unlocated = useMemo(() => stores.filter((s) => s.latitude === null || s.longitude === null), [stores]);
  const selectedStore = selection?.kind === "store" ? stores.find((s) => s.id === selection.id) ?? null : null;
  const selectedPlace = selection?.kind === "place" ? places.find((p) => p.id === selection.id) ?? null : null;
  // Layer counts follow the selected store (or the store a selected place belongs to); otherwise all stores.
  const scopeStore = selectedStore ?? (selectedPlace ? stores.find((s) => s.id === selectedPlace.storeId) ?? null : null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(MAP_LAYERS.map((l) => [l.key, 0])) as Record<MapLayerKey, number>;
    for (const p of places) if (!scopeStore || p.storeId === scopeStore.id) c[p.layer] += 1;
    return c;
  }, [places, scopeStore]);
  const unplaced = useMemo(() => places.filter((p) => enabled.has(p.layer) && (p.latitude === null || p.longitude === null)).length, [places, enabled]);

  // ── Map lifecycle ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: { basemap: { type: "raster", tiles: [tileUrl], tileSize: 256, attribution, maxzoom: maxZoom } },
          layers: [
            { id: "background", type: "background", paint: { "background-color": cssColor("--surface-2") } },
            { id: "basemap", type: "raster", source: "basemap" },
          ],
        },
        center: [13.5, 47.7],
        zoom: 6,
        maxZoom,
        attributionControl: { compact: true },
      });
    } catch (e) {
      setMapError(e instanceof Error ? e.message : "WebGL is not available in this browser.");
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    let loaded = 0;
    map.on("error", (e) => {
      const ev = e as unknown as { sourceId?: string; tile?: unknown };
      if (ev.sourceId === "basemap" || ev.tile) {
        if (loaded === 0) setTiles("failed");
      }
    });
    map.on("data", (e) => {
      const ev = e as unknown as { sourceId?: string; tile?: { state?: string } };
      if (ev.sourceId === "basemap" && ev.tile?.state === "loaded") {
        loaded += 1;
        setTiles("ok");
      }
    });

    const onZoom = () => setZoomedIn(map.getZoom() >= PLACES_MIN_ZOOM);
    map.on("zoom", onZoom);

    const applyTheme = () => {
      if (!map.getLayer("background")) return;
      const dark = document.documentElement.dataset.theme === "dark";
      map.setPaintProperty("background", "background-color", cssColor("--surface-2"));
      map.setPaintProperty("basemap", "raster-brightness-max", dark ? 0.55 : 1);
      map.setPaintProperty("basemap", "raster-saturation", dark ? -0.6 : -0.25);
    };
    map.on("load", applyTheme);
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const withCoords = stores.filter((s) => s.latitude !== null && s.longitude !== null);
    if (withCoords.length === 1) {
      map.jumpTo({ center: [withCoords[0]!.longitude!, withCoords[0]!.latitude!], zoom: 13 });
    } else if (withCoords.length > 1) {
      const b = new maplibregl.LngLatBounds();
      for (const s of withCoords) b.extend([s.longitude!, s.latitude!]);
      map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 70, right: 70 }, maxZoom: 13, animate: false });
    }
    onZoom();

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; marker effects below follow prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileUrl, attribution, maxZoom]);

  // ── Store markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = located.map((s) => {
      const meta = GROWTH_CLASS_META[s.growthClass];
      const selected = selection?.kind === "store" && selection.id === s.id;
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${s.name}: revenue ${s.revenue ?? "missing"}, ${meta.label.toLowerCase()}${s.growth ? ` (${s.growth} year over year)` : ""}`);
      el.setAttribute("aria-pressed", String(selected));
      el.className = "group z-10 flex cursor-pointer flex-col items-center";
      const dot = document.createElement("span");
      dot.className = cn("flex items-center justify-center rounded-full text-[10px] font-bold leading-none text-white", RING[s.growthClass], selected && "outline outline-2 outline-offset-2 outline-ink");
      dot.style.width = `${s.diameter}px`;
      dot.style.height = `${s.diameter}px`;
      dot.style.background = s.color;
      dot.textContent = meta.glyph;
      const label = document.createElement("span");
      label.className = cn("mt-0.5 whitespace-nowrap rounded-sm border border-line bg-surface px-1 text-[11px] leading-4 text-ink", selected && "font-semibold");
      label.textContent = s.name;
      el.append(dot, label);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSelection({ kind: "store", id: s.id });
      });
      // Anchor at the centre of the circle, not of circle + label.
      return new maplibregl.Marker({ element: el, anchor: "top", offset: [0, -s.diameter / 2] }).setLngLat([s.longitude!, s.latitude!]).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [located, selection]);

  // ── Place markers (only for enabled layers) ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!zoomedIn) return;
    const markers = places
      .filter((p) => enabled.has(p.layer) && p.latitude !== null && p.longitude !== null)
      .map((p) => {
        const code = MAP_LAYERS.find((l) => l.key === p.layer)!.code;
        const selected = selection?.kind === "place" && selection.id === p.id;
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", `${p.category}: ${p.name}${p.isDemo ? " (fictional demo place)" : ""}`);
        el.className = cn(
          "flex h-[18px] w-[18px] cursor-pointer items-center justify-center border font-mono text-[10px] font-semibold leading-none",
          p.layer === "COMPETITOR" ? "rounded-sm border-ink bg-ink text-surface" : "rounded-full border-line-strong bg-surface text-ink",
          selected && "outline outline-2 outline-offset-1 outline-accent",
        );
        el.textContent = code;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelection({ kind: "place", id: p.id });
        });
        return new maplibregl.Marker({ element: el }).setLngLat([p.longitude!, p.latitude!]).addTo(map);
      });
    return () => markers.forEach((m) => m.remove());
  }, [places, enabled, selection, zoomedIn]);

  const selectStore = (s: MapStore) => {
    setSelection({ kind: "store", id: s.id });
    if (s.latitude !== null && s.longitude !== null) {
      mapRef.current?.flyTo({ center: [s.longitude, s.latitude], zoom: 14, essential: false });
    }
  };
  const showAll = () => {
    setSelection(null);
    const map = mapRef.current;
    if (!map || located.length === 0) return;
    const b = new maplibregl.LngLatBounds();
    for (const s of located) b.extend([s.longitude!, s.latitude!]);
    map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 70, right: 70 }, maxZoom: 13, essential: false });
  };
  const toggle = (k: MapLayerKey) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="grid gap-3 lg:grid-cols-[288px_minmax(0,1fr)]">
      {/* ── Side column: keyboard-accessible store list + layers ── */}
      <div className="order-2 flex flex-col gap-3 lg:order-1">
        <section className="rounded-md border border-line bg-surface" aria-labelledby="map-stores-h">
          <header className="flex min-h-10 items-center justify-between border-b border-line px-3 py-1.5">
            <h2 id="map-stores-h" className="text-[13px] font-semibold">Stores <span className="num ml-1 font-normal text-ink-3">{located.length}</span></h2>
            <button type="button" className="btn-ghost btn-sm" onClick={showAll}>Show all</button>
          </header>
          <ul className="divide-y divide-line">
            {located.map((s) => {
              const meta = GROWTH_CLASS_META[s.growthClass];
              const active = selectedStore?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectStore(s)}
                    className={cn("flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-surface-2", active && "bg-surface-2")}
                  >
                    <span aria-hidden className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-[1px]" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", active && "font-semibold")}>{s.name}</span>
                      <span className="flex items-center justify-between gap-2 text-xs text-ink-2">
                        <span className="num">{s.revenue ?? "— Missing data"}</span>
                        <span className="whitespace-nowrap font-mono text-[10px] uppercase text-ink-3" title={meta.description}>
                          <span aria-hidden>{meta.glyph} </span>{meta.label}{s.growth ? <span className="num"> {s.growth}</span> : null}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {located.length === 0 && <li className="px-3 py-3 text-xs text-ink-3">No store has coordinates yet.</li>}
          </ul>
          {unlocated.length > 0 && (
            <div className="border-t border-line px-3 py-2">
              <div className="label mb-1">Not on map — coordinates missing</div>
              <ul className="space-y-0.5 text-xs">
                {unlocated.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    <Link href={`/stores/${s.id}/edit`} className="link shrink-0">Add coordinates</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <fieldset className="rounded-md border border-line bg-surface">
          <legend className="sr-only">Map layers</legend>
          <div className="flex min-h-10 items-center justify-between border-b border-line px-3 py-1.5">
            <h2 className="text-[13px] font-semibold">Layers</h2>
            <span className="truncate pl-2 text-xs text-ink-3">{scopeStore ? scopeStore.name : "All stores"}</span>
          </div>
          <ul className="divide-y divide-line">
            {MAP_LAYERS.map((l) => {
              const count = counts[l.key];
              return (
                <li key={l.key} className="px-3 py-1.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[rgb(var(--ink))]" checked={enabled.has(l.key)} onChange={() => toggle(l.key)} />
                    <span
                      aria-hidden
                      className={cn("flex h-4 w-4 shrink-0 items-center justify-center border font-mono text-[9px] font-semibold leading-none", l.key === "COMPETITOR" ? "rounded-sm border-ink bg-ink text-surface" : "rounded-full border-line-strong bg-surface")}
                    >
                      {l.code}
                    </span>
                    <span className="flex-1">{l.label}</span>
                    <span className="num text-xs text-ink-2">{count}</span>
                  </label>
                  {count === 0 && (
                    <p className="pl-[22px] text-xs text-ink-3">
                      No data — {scopeStore ? <Link className="link" href={`/research?store=${scopeStore.id}`}>run research for this store</Link> : <Link className="link" href="/research">run research for this store</Link>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
            Layers show only stored research rows; each carries its source.
            {unplaced > 0 && <> <span className="num">{unplaced}</span> row(s) in the enabled layers have no coordinates and are not drawn.</>}
          </p>
        </fieldset>
      </div>

      {/* ── Map ── */}
      <div className="order-1 flex min-w-0 flex-col gap-2 lg:order-2">
        {tiles === "failed" && (
          <Notice tone="warn">
            Basemap tiles could not be loaded — check network access or NEXT_PUBLIC_MAP_TILE_URL. Store markers are still positioned correctly.
          </Notice>
        )}
        {mapError && <Notice tone="error" title="The map could not be started">{mapError} Use the store list to open a store.</Notice>}
        <div className="relative overflow-hidden rounded-md border border-line bg-surface-2">
          <div ref={container} className="h-[60vh] min-h-[420px] w-full lg:h-[calc(100vh-330px)]" role="region" aria-label="Map of stores. Use the store list next to the map to select a store with the keyboard." />

          {!zoomedIn && enabled.size > 0 && !selectedStore && !selectedPlace && (
            <p className="pointer-events-none absolute right-2 top-2 z-10 max-w-[calc(100%-64px)] rounded-sm border border-line bg-surface px-2 py-0.5 text-xs text-ink-2">
              Select a store or zoom in to see surrounding places
            </p>
          )}

          {(selectedStore || selectedPlace) && (
            <aside aria-live="polite" className="absolute right-2 top-2 z-10 w-[min(300px,calc(100%-16px))] rounded-md border border-line-strong bg-surface shadow-pop">
              <header className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-semibold">{selectedStore?.name ?? selectedPlace?.name}</h3>
                  <p className="truncate text-xs text-ink-3">
                    {selectedStore ? `${selectedStore.city}${monthLabel ? ` · ${monthLabel}` : ""}` : selectedPlace?.category}
                  </p>
                </div>
                <button type="button" className="btn-ghost btn-sm -mr-1.5 -mt-1" aria-label="Close panel" onClick={() => setSelection(null)}><X className="h-4 w-4" /></button>
              </header>

              {selectedStore && (
                <>
                  {selectedStore.isDemo && <div className="px-3 pt-2"><Tag kind="DEMO" /></div>}
                  <dl className="divide-y divide-line px-3 py-1 text-xs">
                    {([
                      ["Revenue", selectedStore.revenue],
                      ["Growth (YoY)", selectedStore.growth ? `${selectedStore.growth} · ${GROWTH_CLASS_META[selectedStore.growthClass].label}` : null],
                      ["Customers / day", selectedStore.customersPerDay],
                      ["Average basket", selectedStore.averageBasket],
                      ["Revenue / m²", selectedStore.revenuePerSqm],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="text-ink-2">{k}</dt>
                        <dd className={cn("num text-[13px] font-semibold", v === null && "font-normal text-ink-3")}>{v ?? "— Missing data"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex gap-2 border-t border-line px-3 py-2">
                    <Link href={`/stores/${selectedStore.id}`} className="btn-primary btn-sm">Open store</Link>
                    <Link href={selectedStore.compareHref} className="btn-secondary btn-sm">Compare</Link>
                  </div>
                </>
              )}

              {selectedPlace && (
                <div className="space-y-2 px-3 py-2 text-xs">
                  {selectedPlace.isDemo && (
                    <div className="flex items-start gap-2">
                      <Tag kind="DEMO" />
                      <span className="text-ink-2">Fictional place — invented for the demo, not a real location.</span>
                    </div>
                  )}
                  <dl className="space-y-1">
                    <div className="flex justify-between gap-3"><dt className="text-ink-2">Distance</dt><dd className="num">{selectedPlace.distance ?? "—"} from {stores.find((s) => s.id === selectedPlace.storeId)?.name ?? "store"}</dd></div>
                    {selectedPlace.openingHours && <div className="flex justify-between gap-3"><dt className="text-ink-2">Opening hours</dt><dd className="num text-right">{selectedPlace.openingHours}</dd></div>}
                    {selectedPlace.detail && <div><dt className="sr-only">Detail</dt><dd>{selectedPlace.detail}</dd></div>}
                  </dl>
                  <p className="border-t border-line pt-2 text-ink-2">
                    Source <Cite source={selectedPlace.source} n={1} /> {selectedPlace.source.title} · accessed <span className="num">{fmtDate(selectedPlace.source.accessedAt)}</span>
                  </p>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* ── Legend: text + shape, never colour alone ── */}
        <div className="grid gap-x-6 gap-y-2 rounded-md border border-line bg-surface px-3 py-2 text-xs md:grid-cols-[auto_minmax(0,1fr)]">
          <div>
            <div className="label mb-1">Marker size — revenue{monthLabel ? `, ${monthLabel}` : ""}</div>
            <div className="flex items-end gap-3">
              {sizeLegend.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block rounded-full border border-ink-3" style={{ width: l.diameter, height: l.diameter }} />
                  <span className="num text-ink-2">{l.label}</span>
                </div>
              ))}
              {sizeLegend.length === 0 && <span className="text-ink-3">No revenue data</span>}
            </div>
            <p className="mt-1 text-ink-3">Circle area is proportional to revenue (minimum size applies).</p>
          </div>
          <div>
            <div className="label mb-1">Marker symbol and ring — revenue vs same month last year</div>
            <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {(Object.keys(GROWTH_CLASS_META) as GrowthClass[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-3 text-[9px] font-bold leading-none text-white", RING[k])}>{GROWTH_CLASS_META[k].glyph}</span>
                  <span><span className="font-medium">{GROWTH_CLASS_META[k].label}</span> <span className="text-ink-3">{GROWTH_CLASS_META[k].description}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
