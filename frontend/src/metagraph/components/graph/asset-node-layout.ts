// Layout constants/helpers shared between AssetNode.tsx and LineageGraph.tsx's
// dagre pass. Kept out of AssetNode.tsx itself so that file only exports the
// component - mixing component and non-component exports in one file disables
// Vite's Fast Refresh for it (react-refresh/only-export-components).

export const NODE_WIDTH = 320;
export const VISIBLE_COLUMNS = 5;
export const HEADER_HEIGHT = 76;
export const TOGGLE_ROW_HEIGHT = 41;
export const COLUMN_ROW_HEIGHT = 37;
export const SHOW_MORE_ROW_HEIGHT = 37;
export const PENDING_ROW_HEIGHT = 46;

/** Estimates a node's rendered height for the dagre layout pass (default-expanded, capped at VISIBLE_COLUMNS). */
export function estimateNodeHeight(node) {
  if (!node.documented) return HEADER_HEIGHT + PENDING_ROW_HEIGHT;

  const visibleRows = Math.min(node.columns.length, VISIBLE_COLUMNS);
  const showMoreRow = node.columns.length > VISIBLE_COLUMNS ? SHOW_MORE_ROW_HEIGHT : 0;
  return HEADER_HEIGHT + TOGGLE_ROW_HEIGHT + visibleRows * COLUMN_ROW_HEIGHT + showMoreRow;
}
