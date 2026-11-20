'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { activeProfile, loadSettings, loadWorld, saveSettings, saveWorld } from '@/lib/store';
import type { Settings, World } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const [s, setS] = useState<Settings>({ profiles: [], active: {} });
  const [world, setWorld] = useState<World | null>(null);
  const [msg, setMsg] = useState('');
  const worldInput = useRef<HTMLInputElement>(null);
  const wallInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setS(loadSettings());
    setWorld(loadWorld());
  }, []);

  async function importWorld(file: File) {
    try {
      const text = await file.text();
      const j = JSON.parse(text) as World;
      if (!Array.isArray(j.blocks) || !Array.isArray(j.characters)) {
        setMsg('不是剧本文件：缺少 blocks 或 characters');
        return;
      }
      const w: World = {
        ...j,
        id: j.id || `w_${Date.now().toString(36)}`,
        title: j.title || '未命名剧本',
        updatedAt: Date.now(),
      };
      saveWorld(w);
      setWorld(w);
      setMsg(`已载入：${w.title}`);
    } catch (e) {
      setMsg('导入失败：' + (e instanceof Error ? e.message : '文件格式不对'));
    }
  }

  async function pickWallpaper(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxW = 1280;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas 不可用'));
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = url;
    }).catch(() => '');

    if (!dataUrl) {
      setMsg('这张图读不出来');
      return;
    }
    const next = { ...s, wallpaper: dataUrl, wallpaperName: file.name };
    setS(next);
    saveSettings(next);
    setMsg('壁纸已更换');
  }

  const story = activeProfile(s, 'story');
  const storyOn = !!(story.baseUrl && story.model);

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">设定</div>
          <div className="right">{msg}</div>
        </div>

        <div className="body">
          <Link href="/settings/api" className="menu-row">
            <span className="k">接口与预设</span>
            <span className="v">{storyOn ? `剧情 · ${story.model}` : '未接'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <div className="section-title">剧本</div>
          <div className="muted">
            {world ? `当前：${world.title} · ${world.blocks.length} 块 · ${world.characters.length} 人` : '还没有导入剧本'}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => worldInput.current?.click()}>导入剧本</button>
            {world && (
              <button
                className="btn ghost"
                onClick={() => {
                  saveWorld(null);
                  setWorld(null);
                  setMsg('已移除剧本');
                }}
              >
                移除
              </button>
            )}
          </div>
          <input
            ref={worldInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) importWorld(f);
              e.target.value = '';
            }}
          />

          <div className="section-title">大厅壁纸</div>
          <div className="muted">{s.wallpaperName || '默认壁纸'}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => wallInput.current?.click()}>换壁纸</button>
            {s.wallpaper && (
              <button
                className="btn ghost"
                onClick={() => {
                  const next = { ...s, wallpaper: '', wallpaperName: '' };
                  setS(next);
                  saveSettings(next);
                  setMsg('已恢复默认壁纸');
                }}
              >
                恢复默认
              </button>
            )}
          </div>
          <input
            ref={wallInput}
            type="file"
            accept="image/*"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) pickWallpaper(f);
              e.target.value = '';
            }}
          />

          {msg && <div className="err" style={{ color: 'var(--ink-2)' }}>{msg}</div>}
        </div>
      </div>
    </main>
  );
}
