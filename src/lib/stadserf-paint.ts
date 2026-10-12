import type { ExpressionSpecification } from "maplibre-gl";

/** Same purple family as the dashed boundary. Quieter than a paid zone. */
export const STADSERF_FILL_COLOR = "#c084d4";
export const STADSERF_LINE_REST = "#c084d4";
export const STADSERF_LINE_CURRENT = "#d4a3de";
export const STADSERF_LINE_HOVER = "#e7c6f2";
export const STADSERF_LINE_SELECTED = "#f3e8ff";

export const STADSERF_FILL_BASE = 0.05;
export const STADSERF_FILL_CURRENT = 0.08;
export const STADSERF_FILL_HOVER = 0.095;
export const STADSERF_FILL_SELECTED = 0.15;

export const STADSERF_LINE_OPACITY_BASE = 0.52;
export const STADSERF_LINE_OPACITY_CURRENT = 0.66;
export const STADSERF_LINE_OPACITY_HOVER = 0.8;
export const STADSERF_LINE_OPACITY_SELECTED = 0.94;

/** Width at the usual city zoom. The map expression eases a little with zoom. */
export const STADSERF_LINE_WIDTH_BASE = 1.8;
export const STADSERF_LINE_WIDTH_CURRENT = 2.1;
export const STADSERF_LINE_WIDTH_HOVER = 2.35;
export const STADSERF_LINE_WIDTH_SELECTED = 3.5;

type StadserfVisualState = {
  selected: boolean;
  hover: boolean;
  current: boolean;
};

function pickState<T>(state: StadserfVisualState, selected: T, hover: T, current: T, base: T): T {
  if (state.selected) return selected;
  if (state.hover) return hover;
  if (state.current) return current;
  return base;
}

export function stadserfFillOpacityForState(state: StadserfVisualState): number {
  return pickState(
    state,
    STADSERF_FILL_SELECTED,
    STADSERF_FILL_HOVER,
    STADSERF_FILL_CURRENT,
    STADSERF_FILL_BASE,
  );
}

export function stadserfLineWidthForState(state: StadserfVisualState): number {
  return pickState(
    state,
    STADSERF_LINE_WIDTH_SELECTED,
    STADSERF_LINE_WIDTH_HOVER,
    STADSERF_LINE_WIDTH_CURRENT,
    STADSERF_LINE_WIDTH_BASE,
  );
}

function stateCase(
  selected: number | string,
  hover: number | string,
  current: number | string,
  base: number | string,
): ExpressionSpecification {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selected,
    ["boolean", ["feature-state", "hover"], false],
    hover,
    ["boolean", ["feature-state", "current"], false],
    current,
    base,
  ];
}

export const STADSERF_FILL_OPACITY: ExpressionSpecification = stateCase(
  STADSERF_FILL_SELECTED,
  STADSERF_FILL_HOVER,
  STADSERF_FILL_CURRENT,
  STADSERF_FILL_BASE,
);

export const STADSERF_LINE_COLOR: ExpressionSpecification = stateCase(
  STADSERF_LINE_SELECTED,
  STADSERF_LINE_HOVER,
  STADSERF_LINE_CURRENT,
  STADSERF_LINE_REST,
);

export const STADSERF_LINE_OPACITY: ExpressionSpecification = stateCase(
  STADSERF_LINE_OPACITY_SELECTED,
  STADSERF_LINE_OPACITY_HOVER,
  STADSERF_LINE_OPACITY_CURRENT,
  STADSERF_LINE_OPACITY_BASE,
);

export const STADSERF_LINE_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  stateCase(3.1, 2.05, 1.85, 1.55),
  14,
  stateCase(
    STADSERF_LINE_WIDTH_SELECTED,
    STADSERF_LINE_WIDTH_HOVER,
    STADSERF_LINE_WIDTH_CURRENT,
    STADSERF_LINE_WIDTH_BASE,
  ),
  16,
  stateCase(3.9, 2.6, 2.3, 2.05),
];
