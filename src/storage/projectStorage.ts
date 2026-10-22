/**
 * Browser-side persistence. Not part of the engine seam (needs a real browser),
 * so it's thin and defensive: every access is guarded and never throws into the UI.
 */

import type { SerializedProject } from "@/engine/BoardEngine";

const DB_NAME = "perfboard-routing-planner";
const STORE = "projects";
const KEY = "current";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Autosave the current project. Returns false (not throws) on any failure. */
export async function saveProject(data: SerializedProject): Promise<boolean> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Load the autosaved project, or null if none / unavailable. */
export async function loadProject(): Promise<SerializedProject | null> {
  try {
    const db = await openDB();
    const data = await new Promise<SerializedProject | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as SerializedProject) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return data;
  } catch {
    return null;
  }
}

/** Trigger a browser download of the project as a .json file. */
export function downloadProject(data: SerializedProject, filename = "perfboard-project.json"): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a user-picked .json file into a project object. */
export async function readProjectFile(file: File): Promise<SerializedProject> {
  const text = await file.text();
  return JSON.parse(text) as SerializedProject;
}
