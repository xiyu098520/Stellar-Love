'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadSettings, loadWorld, saveSettings, saveWorld } from '@/lib/store';
import type { Settings, World } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const [s, setS] = useState<Settings>({ baseUrl: '', apiKey: '', model: '' });
  const [world, setWorld] = useState<World | null>(null);
  const [msg, setMsg] = useState('');
  const worldInput = useRef<HTMLInputElement>(null);
  const wallInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setS(loadSettings());
    setWorld(loadWorld());
  }, []);

  function patch(p: Partial<Settings>) {
    setS(prev => ({ ...prev, ...p }));
  }

  function persist() {
    saveSettings(s);
    setMsg('已保存');
    setTimeout(() => setMsg(''), 1600);
  }

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

  const wall = s.wallpaper;

  return (
    <main className="page">
      <div
        className={`wallpaper${wall ? '' : ' default'}`}
        style={wall ? { backgroundImage: `url(${wall})` } : undefined}
      />
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">设定</div>
          <div className="right">{msg}</div>
        </div>

        <div className="body">
          <div className="section-title">接口</div>

          <div className="field">
            <label>API 地址</label>
            <input
              value={s.baseUrl}
              onChange={e => patch({ baseUrl: e.target.value })}
              placeholder="https://your-proxy.example.com/v1"
            />
            <div className="tip">填到 /v1 为止，程序会自动接 /chat/completions。</div>
          </div>

          <div className="field">
            <label>密钥</label>
            <input
              value={s.apiKey}
              onChange={e => patch({ apiKey: e.target.value })}
              placeholder="sk-..."
              type="password"
            />
            <div className="tip">只存在这台设备的浏览器里，不会上传到别处。</div>
          </div>

          <div className="field">
            <label>模型</label>
            <input
              value={s.model}
              onChange={e => patch({ model: e.target.value })}
              placeholder="gemini-3.8-flash"
            />
          </div>

          <div className="field">
            <label>温度（0 - 2）</label>
            <input
              value={String(s.temperature ?? 0.9)}
              onChange={e => patch({ temperature: Number(e.target.value) || 0 })}
              placeholder="0.9"
            />
            <div className="tip">越高越发散，恋爱向建议 0.85 到 1.0。</div>
          </div>

          <button className="btn" onClick={persist}>保存</button>

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
