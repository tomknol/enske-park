/** Shared timings. MapLibre paint transitions are linear; CSS uses ease-out. */
export const MOTION = {
  fast: 140,
  normal: 200,
  slow: 280,
  /** Overlapping inner-content crossfade. Matches the CSS variables. */
  panelOut: 120,
  panelIn: 180,
} as const;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function motionMs(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

export function mapPaintTransition(ms: number = MOTION.normal): {
  duration: number;
  delay: number;
} {
  return { duration: motionMs(ms), delay: 0 };
}
