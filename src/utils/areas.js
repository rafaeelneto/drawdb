import { ObjectType, noteWidth } from "../data/constants";
import { getTableHeight, getTableWidth } from "./utils";
import { getViewHeight, getViewWidth, resolveViewColumns } from "./views";

const centerInside = (rect, area) => {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return (
    cx >= area.x &&
    cx <= area.x + area.width &&
    cy >= area.y &&
    cy <= area.y + area.height
  );
};

/**
 * Tables, views and notes that belong to an area. An element belongs to an
 * area when its center lies inside it.
 */
export function getElementsInArea(
  area,
  { tables, views, notes, showComments, relationships },
) {
  const result = [];
  tables.forEach((table) => {
    const rect = {
      x: table.x,
      y: table.y,
      width: getTableWidth(table),
      height: getTableHeight(table, showComments, relationships),
    };
    if (centerInside(rect, area)) {
      result.push({ type: ObjectType.TABLE, element: table });
    }
  });
  views.forEach((view) => {
    const rect = {
      x: view.x,
      y: view.y,
      width: getViewWidth(view),
      height: getViewHeight(
        view,
        resolveViewColumns(view, tables),
        showComments,
      ),
    };
    if (centerInside(rect, area)) {
      result.push({ type: ObjectType.VIEW, element: view });
    }
  });
  notes.forEach((note) => {
    const rect = {
      x: note.x,
      y: note.y,
      width: note.width ?? noteWidth,
      height: note.height,
    };
    if (centerInside(rect, area)) {
      result.push({ type: ObjectType.NOTE, element: note });
    }
  });
  return result;
}
