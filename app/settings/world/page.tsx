'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadWorld, saveWorld } from '@/lib/store';
import type { World, WorldBlock } from '@/lib/types';

export default function WorldPage() {
  const router = useRouter();
  const [w, setW] = useState<World | null>(null);
  const [open, setOpen] = useState<number | null>(0);
  const [msg, setMsg] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setW(loadWorld());
  }, []);

  function commit(next: World) {
    next.updatedAt = Date.now();
    setW({ ...next, blocks: [...next.blocks] });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveWorld({ ...next, blocks: [...next.blocks] }), 350);
  }

  function patch(p: Partial<World>) {
    if (!w) return;
    commit({ ...w, ...p });
  }

  function patchBlock(i: number, p: Partial<WorldBlock>) {
    if (!w) return;
    commit({ ...w, blocks: w.blocks.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  }

  function addBlock() {
    if (!w) return;
    commit({ ...w, blocks: [...w.blocks, { title: '新栏目', content: '' }] });
    setOpen(w.blocks.length);
  }

  function dropBlock(i: number) {
    if (!w) return;
    commit({ ...w, blocks: w.blocks.filter((_, j) => j !== i) });
    if (open === i) setOpen(null);
  }

  function move(i: number, d: number) {
    if (!w) return;
    const j = i + d;
    if (j < 0 || j >= w.blocks.length) return;
    const blocks = [...w.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    commit({ ...w, blocks });
    setOpen(j);
  }

  async function importWorld(file: File) {
    try {
      const text = await file.text();
      const j = JSON.parse(text) as World;
      if (!Array.isArray(j.blocks) || !Array.isArray(j.characters)) {
        setMsg('不是剧本文件：缺少 blocks 或 characters');
        return;
      }
      const next: World = {
        ...j,
        id: j.id || `w_${Date.now().toString(36)}`,
        title: j.title || '未命名剧本',
        updatedAt: Date.now(),
      };
      saveWorld(next);
      setW(next);
      setOpen(0);
      setMsg(`已载入：${next.title}`);
    } catch (e) {
      setMsg('导入失败：' + (e instanceof Error ? e.message : '文件格式不对'));
    }
  }

  function exportWorld() {
    if (!w) return;
    const blob = new Blob([JSON.stringify(w, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${w.title || 'world'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/settings')}>返回</button>
          <div className="title">剧本</div>
          <div className="right">{msg}</div>
        </div>

        <div className="body">
          {!w ? (
            <>
              <div className="muted">还没有导入剧本。</div>
              <div style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => fileInput.current?.click()}>导入剧本</button>
              </div>
            </>
          ) : (
            <>
              <div className="section-title">基本信息</div>

              <div className="field">
                <label>剧本名</label>
                <input value={w.title} onChange={e => patch({ title: e.target.value })} />
              </div>

              <div className="field">
                <label>原著 / 出处</label>
                <input
                  value={w.source || ''}
                  onChange={e => patch({ source: e.target.value })}
                  placeholder="原作、小说、或「自己的设定」"
                />
              </div>

              <div className="field">
                <label>一句话简介</label>
                <input
                  value={w.tagline || ''}
                  onChange={e => patch({ tagline: e.target.value })}
                  placeholder="一句话说清这个世界在讲什么"
                />
              </div>

              <Link href="/characters" className="menu-row" style={{ marginTop: 6 }}>
                <span className="k">人物</span>
                <span className="v">{w.characters.length} 人</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>

              <div className="section-title">栏目</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                一条栏目就是一段设定，按顺序交给模型。世界观、主线大纲、规则、人物、文风都放这里。
              </div>

              {w.blocks.map((b, i) => (
                <div className="block-card" key={i}>
                  <button className="block-head" onClick={() => setOpen(open === i ? null : i)}>
                    <span className="n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="t">{b.title || '未命名'}</span>
                    <span className="len">{b.content.length}</span>
                  </button>
                  {open === i && (
                    <div className="block-body">
                      <input
                        className="block-title"
                        value={b.title}
                        onChange={e => patchBlock(i, { title: e.target.value })}
                        placeholder="栏目名"
                      />
                      <textarea
                        className="block-text"
                        value={b.content}
                        onChange={e => patchBlock(i, { content: e.target.value })}
                        rows={10}
                        placeholder="这一栏的内容"
                      />
                      <div className="block-actions">
                        <button className="mini" onClick={() => move(i, -1)}>上移</button>
                        <button className="mini" onClick={() => move(i, 1)}>下移</button>
                        <button className="mini danger" onClick={() => dropBlock(i)}>删除</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ marginTop: 14 }}>
                <button className="btn ghost" onClick={addBlock}>新增栏目</button>
              </div>

              <div className="section-title">文件</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => fileInput.current?.click()}>重新导入</button>
                <button className="btn ghost" onClick={exportWorld}>导出</button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    saveWorld(null);
                    setW(null);
                    setMsg('已移除剧本');
                  }}
                >
                  移除
                </button>
              </div>
            </>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) importWorld(f);
              e.target.value = '';
            }}
          />

          {msg && <div className="err" style={{ color: 'var(--ink-2)' }}>{msg}</div>}
        </div>
      </div>
    </main>
  );
}
