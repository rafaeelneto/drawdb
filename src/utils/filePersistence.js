import { jsonDiagramIsValid } from "./validateSchema";

// Singleton managing a FileSystemFileHandle for the active diagram file.
// When the File System Access API is unavailable (Firefox, Safari), open()
// returns null and save/saveAs fall back to a blob download.

const hasFileSystemAccess =
  typeof window !== "undefined" &&
  "showOpenFilePicker" in window &&
  "showSaveFilePicker" in window;

const fileTypes = [
  {
    description: "drawDB diagram",
    accept: { "application/json": [".json", ".drawdb"] },
  },
];

let fileHandle = null;
let lastKnownModified = 0;
let lastKnownText = null;
const listeners = new Set();

const emit = () => listeners.forEach((l) => l(fileHandle));

export function subscribeFile(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getFileName = () => fileHandle?.name ?? null;
export const hasFileHandle = () => fileHandle !== null;
export { hasFileSystemAccess };

// --- remember the last handle across reloads (handles are structured-cloneable)
const IDB_NAME = "drawdb-file";
const IDB_STORE = "handles";
const IDB_TRANSFORMS = "transforms";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE))
        db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_TRANSFORMS))
        db.createObjectStore(IDB_TRANSFORMS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value) {
  try {
    const db = await idb();
    const tx = db.transaction(IDB_STORE, "readwrite");
    if (value) tx.objectStore(IDB_STORE).put(value, "last");
    else tx.objectStore(IDB_STORE).delete("last");
  } catch {
    // best effort
  }
}

async function idbGet() {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get("last");
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Pan/zoom live here, keyed by file name, so the file itself stays free of
// view state that changes constantly (and would pollute git diffs).
export async function saveTransform(transform) {
  const name = getFileName();
  if (!name) return;
  try {
    const db = await idb();
    db.transaction(IDB_TRANSFORMS, "readwrite")
      .objectStore(IDB_TRANSFORMS)
      .put(transform, name);
  } catch {
    // best effort
  }
}

export async function loadTransform() {
  const name = getFileName();
  if (!name) return null;
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const req = db
        .transaction(IDB_TRANSFORMS)
        .objectStore(IDB_TRANSFORMS)
        .get(name);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setHandle(handle) {
  fileHandle = handle;
  lastKnownModified = 0;
  lastKnownText = null;
  await idbSet(handle);
  emit();
}

/** Re-attach the previously used file, if the permission is still granted. */
export async function restoreFile() {
  if (!hasFileSystemAccess || fileHandle) return null;
  const handle = await idbGet();
  if (!handle) return null;
  try {
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") return null;
    fileHandle = handle;
    emit();
    return await readFile();
  } catch {
    return null;
  }
}

async function readFile() {
  const file = await fileHandle.getFile();
  const text = await file.text();
  lastKnownModified = file.lastModified;
  lastKnownText = text;
  return text;
}

export async function openFile() {
  if (!hasFileSystemAccess) return null;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: fileTypes,
      multiple: false,
    });
    if (!handle) return null;
    await setHandle(handle);
    return await readFile();
  } catch (e) {
    if (e.name === "AbortError") return null;
    throw e;
  }
}

async function write(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  const file = await handle.getFile();
  lastKnownModified = file.lastModified;
  lastKnownText = text;
}

export async function saveFile(text, suggestedName) {
  if (!fileHandle) return saveFileAs(text, suggestedName);
  if (text === lastKnownText) return true;
  try {
    await write(fileHandle, text);
    return true;
  } catch (e) {
    if (e.name === "NotAllowedError") return saveFileAs(text, suggestedName);
    throw e;
  }
}

export async function saveFileAs(text, suggestedName = "diagram.json") {
  if (!hasFileSystemAccess) {
    downloadFallback(text, suggestedName);
    return true;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: fileTypes,
    });
    await setHandle(handle);
    await write(handle, text);
    return true;
  } catch (e) {
    if (e.name === "AbortError") return false;
    throw e;
  }
}

export async function closeFile() {
  await setHandle(null);
}

/** Returns the file text if it changed on disk since our last read/write. */
export async function readIfChanged() {
  if (!fileHandle) return null;
  try {
    const file = await fileHandle.getFile();
    if (file.lastModified === lastKnownModified) return null;
    const text = await file.text();
    lastKnownModified = file.lastModified;
    if (text === lastKnownText) return null;
    lastKnownText = text;
    return text;
  } catch {
    return null;
  }
}

function downloadFallback(text, name) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// --- diagram <-> file text

export function serializeDiagram(d) {
  return JSON.stringify(
    {
      title: d.title,
      database: d.database,
      tables: d.tables,
      relationships: d.relationships,
      notes: d.notes,
      subjectAreas: d.subjectAreas,
      types: d.types,
      enums: d.enums,
      views: d.views,
      sqlHeader: d.sqlHeader,
    },
    null,
    2,
  );
}

/** Throws an Error with a readable message when the text is not a valid diagram. */
export function parseDiagram(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
  if (!jsonDiagramIsValid(obj)) {
    throw new Error(
      "File is not a valid drawDB diagram (needs tables, relationships, notes, subjectAreas).",
    );
  }
  return obj;
}
