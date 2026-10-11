/** Dark basemap — parking overlays stay vivid on top. Override via NEXT_PUBLIC_MAP_STYLE_URL. */
export const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://tiles.openfreemap.org/styles/dark";
