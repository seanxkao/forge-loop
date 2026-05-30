const TOOLTIP_OFFSET = 18;
const TOOLTIP_MARGIN = 12;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface TooltipPosition {
  left: number;
  top: number;
}

export function clampTooltipPosition(
  pointer: Point,
  tooltip: Size,
  viewport: Size,
): TooltipPosition {
  const maxLeft = Math.max(TOOLTIP_MARGIN, viewport.width - tooltip.width - TOOLTIP_MARGIN);
  const maxTop = Math.max(TOOLTIP_MARGIN, viewport.height - tooltip.height - TOOLTIP_MARGIN);

  return {
    left: clamp(pointer.x + TOOLTIP_OFFSET, TOOLTIP_MARGIN, maxLeft),
    top: clamp(pointer.y + TOOLTIP_OFFSET, TOOLTIP_MARGIN, maxTop),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
