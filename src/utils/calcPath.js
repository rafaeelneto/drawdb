import { tableFieldHeight, tableHeaderHeight } from "../data/constants";
import { getCommentHeight, getFieldOffsetY, getTableWidth } from "./utils";

/**
 * Generates an SVG path string to visually represent a relationship between two fields.
 *
 * @param {{
 *   startTable: { x: number, y: number, width?: number },
 *   endTable: { x: number, y: number, width?: number },
 *   startFieldIndex: number,
 *   endFieldIndex: number
 * }} r - Relationship data.
 * @param {number} zoom - Zoom level (used to scale vertical spacing).
 * @returns {string} SVG path "d" attribute string.
 */
export function calcPath(r, zoom = 1, showComments = true) {
  if (!r) {
    return "";
  }

  const startTableWidth = getTableWidth(r.startTable);
  const endTableWidth = getTableWidth(r.endTable);
  const startWidth = startTableWidth * zoom;
  const endWidth = endTableWidth * zoom;
  let x1 = r.startTable.x;
  let y1 =
    r.startTable.y +
    getFieldOffsetY(
      r.startTable.fields ?? [],
      r.startFieldIndex,
      startTableWidth,
      showComments,
    ) +
    tableHeaderHeight +
    getCommentHeight(r.startTable.comment, startTableWidth, showComments) +
    tableFieldHeight / 2;
  let x2 = r.endTable.x;
  let y2 =
    r.endTable.y +
    getFieldOffsetY(
      r.endTable.fields ?? [],
      r.endFieldIndex,
      endTableWidth,
      showComments,
    ) +
    getCommentHeight(r.endTable.comment, endTableWidth, showComments) +
    tableHeaderHeight +
    tableFieldHeight / 2;

  return curvePath(x1, y1, startWidth, x2, y2, endWidth, zoom);
}

/**
 * Cubic bezier between two field anchors. The curve leaves and enters the
 * tables horizontally, on the edges that face each other, or loops out of the
 * same side when the tables overlap horizontally.
 */
function curvePath(x1, y1, startWidth, x2, y2, endWidth, zoom) {
  let sx, ex, dirStart, dirEnd;
  if (x1 + startWidth <= x2) {
    sx = x1 + startWidth;
    ex = x2;
    dirStart = 1;
    dirEnd = -1;
  } else if (x2 + endWidth < x1) {
    sx = x1;
    ex = x2 + endWidth;
    dirStart = -1;
    dirEnd = 1;
  } else {
    sx = x1 + startWidth;
    ex = x2 + endWidth;
    dirStart = 1;
    dirEnd = 1;
  }

  const min = 40 * zoom;
  const max = 200 * zoom;
  const k =
    dirStart === dirEnd
      ? Math.min(max, min + Math.abs(y2 - y1) / 4)
      : Math.min(max, Math.max(min, Math.abs(ex - sx) / 2));

  return `M ${sx} ${y1} C ${sx + dirStart * k} ${y1}, ${ex + dirEnd * k} ${y2}, ${ex} ${y2}`;
}

/**
 * Builds the path for a composite (multi-column) foreign key: one curve per
 * column pair, with cardinality anchors at the average column height.
 *
 * @param {{
 *   startTable: { x: number, y: number, width?: number, comment?: string, fields?: any[] },
 *   endTable: { x: number, y: number, width?: number, comment?: string, fields?: any[] },
 *   startFieldIndices: number[],
 *   endFieldIndices: number[],
 * }} r
 * @returns {{
 *   path: string,
 *   labelPoint: { x: number, y: number },
 *   startCardinality: { x: number, y: number },
 *   endCardinality: { x: number, y: number },
 * } | null}
 */
export function calcCompositePath(r, zoom = 1, showComments = true) {
  if (!r || !r.startFieldIndices?.length || !r.endFieldIndices?.length) {
    return null;
  }

  const startTableWidth = getTableWidth(r.startTable);
  const endTableWidth = getTableWidth(r.endTable);
  const startWidth = startTableWidth * zoom;
  const endWidth = endTableWidth * zoom;
  const anchorY = (table, index, tableWidth) =>
    table.y +
    tableHeaderHeight +
    getCommentHeight(table.comment, tableWidth, showComments) +
    getFieldOffsetY(table.fields ?? [], index, tableWidth, showComments) +
    tableFieldHeight / 2;

  const startYs = r.startFieldIndices.map((i) =>
    anchorY(r.startTable, i, startTableWidth),
  );
  const endYs = r.endFieldIndices.map((i) =>
    anchorY(r.endTable, i, endTableWidth),
  );

  const segs = r.startFieldIndices.map((_, i) =>
    curvePath(
      r.startTable.x,
      startYs[i],
      startWidth,
      r.endTable.x,
      endYs[Math.min(i, endYs.length - 1)],
      endWidth,
      zoom,
    ),
  );

  const avg = (ys) => ys.reduce((a, b) => a + b, 0) / ys.length;
  const startIsLeft =
    r.startTable.x + startWidth / 2 <= r.endTable.x + endWidth / 2;
  const startX = startIsLeft ? r.startTable.x + startWidth : r.startTable.x;
  const endX = startIsLeft ? r.endTable.x : r.endTable.x + endWidth;
  const dir = startIsLeft ? 1 : -1;
  const startY = avg(startYs);
  const endY = avg(endYs);

  return {
    path: segs.join(" "),
    labelPoint: { x: (startX + endX) / 2, y: (startY + endY) / 2 },
    startCardinality: { x: startX + dir * 28 * zoom, y: startY },
    endCardinality: { x: endX - dir * 28 * zoom, y: endY },
  };
}
