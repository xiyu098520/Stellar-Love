'use client';

import type { Save, Settings, World } from './types';

const DB_NAME = 'stellar-love';
const DB_VERSION = 1;
const STORE = 'saves';
const LS_SETTINGS = 'sl.settings';
const LS_WORLD = 'sl.world';
const LS_LAST = 'sl.lastSave';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function listSaves(): Promise<Save[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as Save[]) || [];
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSave(id: string): Promise<Save | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as Save | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function putSave(save: Save): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(save);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  localStorage.setItem(LS_LAST, save.id);
}

export async function delSave(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function loadSettings(): Settings {
  if (typeof window === 'undefined') {
    return { baseUrl: '', apiKey: '', model: '' };
  }
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return JSON.parse(raw) as Settings;
  } catch {}
  return { baseUrl: '', apiKey: '', model: '' };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
}

export function loadWorld(): World | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_WORLD);
    if (raw) return JSON.parse(raw) as World;
  } catch {}
  return null;
}

export function saveWorld(w: World | null): void {
  if (!w) {
    localStorage.removeItem(LS_WORLD);
    return;
  }
  try {
    localStorage.setItem(LS_WORLD, JSON.stringify(w));
  } catch {
    alert('剧本太大了，浏览器存不下。请换一个更大的浏览器或精简剧本。');
  }
}

export function lastSaveId(): string | null {
  return localStorage.getItem(LS_LAST);
}

export function newId(prefix = 's'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
