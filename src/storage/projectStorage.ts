/**
 * Browser-side persistence. Not part of the engine seam (needs a real browser),
 * so it's thin and defensive: every access is guarded and never throws into the UI.
 */

import type { SerializedProject } from "@/engine/BoardEngine";
import { EXAMPLES } from "./examples";

const DB_NAME = "perfboard-routing-planner";
const STORE = "projects";
const KEY = "current";
const RECENT_KEY = "perfboard_recent_projects";

export interface RecentProjectItem {
  id: string;
  name: string;
  lastModified: string;
  data: SerializedProject;
}

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

/** Format timestamp like STM32CubeMX: "23/10/2026 9:37:49" */
export function formatCurrentDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = d.getHours();
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
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

/** Get list of recent projects. Seeds default examples if none exist yet. */
export function getRecentProjects(): RecentProjectItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore parse error */
  }

  // Seed default recent projects matching user's STM32 project style
  const seeded: RecentProjectItem[] = [
    {
      id: "seed-gabas-rtos",
      name: "GABAS_RTOS.pbrp",
      lastModified: "23/10/2026 9:37:49",
      data: EXAMPLES[2].project,
    },
    {
      id: "seed-finalgabas",
      name: "FINALGABAS.pbrp",
      lastModified: "16/10/2026 8:46:35",
      data: EXAMPLES[1].project,
    },
    {
      id: "seed-adc-pooling",
      name: "ADC_Pooling.pbrp",
      lastModified: "02/10/2026 9:39:06",
      data: EXAMPLES[0].project,
    },
    {
      id: "seed-dma",
      name: "DMA.pbrp",
      lastModified: "25/09/2026 8:17:30",
      data: EXAMPLES[1].project,
    },
    {
      id: "seed-interup",
      name: "Interup.pbrp",
      lastModified: "18/09/2026 8:29:56",
      data: EXAMPLES[0].project,
    },
  ];

  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(seeded));
  } catch {
    /* ignore */
  }
  return seeded;
}

/** Add or update a project in the recent list. */
export function addRecentProject(name: string, data: SerializedProject): void {
  if (typeof window === "undefined") return;
  try {
    const list = getRecentProjects();
    const existingIndex = list.findIndex((item) => item.name === name);
    const item: RecentProjectItem = {
      id: existingIndex >= 0 ? list[existingIndex].id : `proj-${Date.now()}`,
      name,
      lastModified: formatCurrentDate(),
      data,
    };
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
    }
    list.unshift(item);
    // keep up to 12 recent items
    const trimmed = list.slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

/** Remove a project from recent list. */
export function removeRecentProject(id: string): RecentProjectItem[] {
  if (typeof window === "undefined") return [];
  try {
    const list = getRecentProjects().filter((item) => item.id !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
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
