import { BarChart3, FileText, FlaskConical, GitCompareArrows, LayoutDashboard, Lightbulb, Map, Search, Settings, Store } from "lucide-react";

export const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/stores", label: "Stores", icon: Store },
  { href: "/map", label: "Map", icon: Map },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/strategies", label: "Strategies", icon: Lightbulb },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/research", label: "Research", icon: Search },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** Window events used to open global overlays from anywhere. */
export const EVENTS = {
  /** detail: { query?: string } */
  analyst: "rl:analyst-open",
  palette: "rl:palette-open",
} as const;

export function openAnalyst(query?: string) {
  window.dispatchEvent(new CustomEvent(EVENTS.analyst, { detail: { query } }));
}
