'use client';

import type { ApiKind, ApiProfile, Save, Settings, World } from './types';

const DB_NAME = 'stellar-love';
const DB_VERSION = 1;
const STORE = 'saves';
const LS_SETTINGS = 'sl.settings';
const LS_WORLD = 'sl.world';
const LS_LAST = 'sl.lastSave';
/** 壁纸单独放，避免每次读设置都要解析几 MB 的图 */
const LS_WALL = 'sl.wallpaper';
const LS_WALL_NAME = 'sl.wallpaperName';

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

export const API_KINDS: ApiKind[] = ['story', 'assistant', 'tts', 'image'];

export function blankProfile(kind: ApiKind): ApiProfile {
  const base: ApiProfile = {
    id: newId('api'),
    kind,
    name: '默认',
    baseUrl: '',
    apiKey: '',
    model: '',
  };
  if (kind === 'story') return { ...base, temperature: 0.9 };
  if (kind === 'assistant') return { ...base, temperature: 0.3 };
  if (kind === 'tts') {
    return {
      ...base,
      baseUrl: 'https://api.elevenlabs.io/v1',
      model: 'eleven_multilingual_v2',
      speed: 1,
      lang: 'zh',
    };
  }
  return { ...base, size: '1024x1536' };
}

/** 旧版把壁纸塞在设置里，捞出来单独存 */
function migrateWallpaper(p: Settings & { wallpaper?: string; wallpaperName?: string }) {
  if (!p.wallpaper) return;
  try {
    localStorage.setItem(LS_WALL, p.wallpaper);
    localStorage.setItem(LS_WALL_NAME, p.wallpaperName || '');
  } catch {}
  delete p.wallpaper;
  delete p.wallpaperName;
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(p));
  } catch {}
}

export function loadWallpaper(): { url: string; name: string } {
  if (typeof window === 'undefined') return { url: '', name: '' };
  return {
    url: localStorage.getItem(LS_WALL) || '',
    name: localStorage.getItem(LS_WALL_NAME) || '',
  };
}

export function saveWallpaper(url: string, name = ''): void {
  try {
    if (url) {
      localStorage.setItem(LS_WALL, url);
      localStorage.setItem(LS_WALL_NAME, name);
    } else {
      localStorage.removeItem(LS_WALL);
      localStorage.removeItem(LS_WALL_NAME);
    }
  } catch {
    alert('这张壁纸太大了，浏览器存不下。换一张小一点的。');
  }
}

/** 补齐缺失的类型，保证每一类都至少有一套 */
function normalize(s: Settings): Settings {
  const profiles = [...(s.profiles || [])];
  const active = { ...(s.active || {}) };
  for (const kind of API_KINDS) {
    const own = profiles.filter(p => p.kind === kind);
    if (!own.length) {
      const p = blankProfile(kind);
      profiles.push(p);
      active[kind] = p.id;
    } else if (!own.some(p => p.id === active[kind])) {
      active[kind] = own[0].id;
    }
  }
  return { ...s, profiles, active };
}

export function loadSettings(): Settings {
  const empty: Settings = { profiles: [], active: {} };
  if (typeof window === 'undefined') return normalize(empty);
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) {
      const p = JSON.parse(raw) as Settings & {
        baseUrl?: string;
        apiKey?: string;
        model?: string;
        temperature?: number;
      };
      // 旧版本：单套配置，搬到「剧情」里当默认预设
      if (!Array.isArray(p.profiles)) {
        const legacy = p.baseUrl || p.apiKey || p.model;
        const first = blankProfile('story');
        if (legacy) {
          first.name = '默认';
          first.baseUrl = p.baseUrl || '';
          first.apiKey = p.apiKey || '';
          first.model = p.model || '';
          first.temperature = p.temperature ?? 0.9;
        }
        migrateWallpaper(p);
        return normalize({
          profiles: [first],
          active: { story: first.id },
          voiceEnabled: p.voiceEnabled,
        });
      }
      migrateWallpaper(p);
      return normalize(p);
    }
  } catch {}
  return normalize(empty);
}

/** 取某一类当前在用的那套 */
export function activeProfile(s: Settings, kind: ApiKind): ApiProfile {
  const list = s.profiles.filter(p => p.kind === kind);
  return list.find(p => p.id === s.active[kind]) || list[0] || blankProfile(kind);
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
