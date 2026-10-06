"use client";

import dynamic from "next/dynamic";
import type { StoreMapProps } from "./StoreMap";

// MapLibre needs the DOM and WebGL; it is loaded only in the browser.
const StoreMap = dynamic(() => import("./StoreMap").then((m) => m.StoreMap), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-[420px] animate-pulse rounded-md border border-line bg-surface-2" aria-busy="true" aria-label="Loading map" />,
});

export function MapClient(props: StoreMapProps) {
  return <StoreMap {...props} />;
}
