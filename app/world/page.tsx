'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadWorld, newId, saveWorld } from '@/lib/store';
import type { AttrDef, World, WorldBlock } from '@/lib/types';

export default function WorldPage() {
  const router = useRouter();
  const [w, setW] = useState<World | null>(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState<'base' | 'world' | 'main' | 'play' | 'file'>('base');
  const [attrChar, setAttrChar] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ww = loadWorld();
    setW(ww);
    const first = ww?.characters.find(c => c.identity);
    if (first) setAttrChar(first.id);
  }, []);

  function commit(next: World) {
    next.updatedAt = Date.now();
    setW({ ...next });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveWorld({ ...next }), 350);
  }

  function patch(p: Partial<World>) {
    if (!w) return;
    commit({ ...w, ...p });
  }

  function patchExtra(i: number, p: Partial<WorldBlock>) {
    if (!w) return;
    const extras = (w.extras || []).map((b, j) => (j === i ? { ...b, ...p } : b));
    commit({ ...w, extras });
  }

  function patchAttr(i: number, p: Partial<AttrDef>) {
    if (!w) return;
    const attrs = (w.attrs || []).map((a, j) => (j === i ? { ...a, ...p } : a));
    commit({ ...w, attrs });
  }

  function addAttr() {
    if (!w) return;
    commit({ ...w, attrs: [...(w.attrs || []), { id: newId(), name: '', init: 0 }] });
  }

  function dropAttr(i: number) {
    if (!w) return;
    commit({ ...w, attrs: (w.attrs || []).filter((_, j) => j !== i) });
  }

  function patchCharAttr(i: number, p: Partial<AttrDef>) {
    if (!w) return;
    const characters = w.characters.map(c =>
      c.id === attrChar
        ? { ...c, attrs: (c.attrs || []).map((a, j) => (j === i ? { ...a, ...p } : a)) }
        : c,
    );
    commit({ ...w, characters });
  }

  function addCharAttr() {
    if (!w || !attrChar) return;
    const characters = w.characters.map(c =>
      c.id === attrChar ? { ...c, attrs: [...(c.attrs || []), { id: newId(), name: '', init: 0 }] } : c,
    );
    commit({ ...w, characters });
  }

  function dropCharAttr(i: number) {
    if (!w) return;
    const characters = w.characters.map(c =>
      c.id === attrChar ? { ...c, attrs: (c.attrs || []).filter((_, j) => j !== i) } : c,
    );
    commit({ ...w, characters });
  }

  function addExtra() {
    if (!w) return;
    const extras = [...(w.extras || []), { title: '新栏目', content: '' }];
    commit({ ...w, extras });
    setOpen(extras.length - 1);
  }

  function dropExtra(i: number) {
    if (!w) return;
    commit({ ...w, extras: (w.extras || []).filter((_, j) => j !== i) });
    if (open === i) setOpen(null);
  }

  function moveExtra(i: number, d: number) {
    if (!w) return;
    const extras = [...(w.extras || [])];
    const j = i + d;
    if (j < 0 || j >= extras.length) return;
    [extras[i], extras[j]] = [extras[j], extras[i]];
    commit({ ...w, extras });
    setOpen(j);
  }

  function adoptBlocks() {
    if (!w || !w.blocks?.length) return;
    commit({ ...w, extras: [...(w.extras || []), ...w.blocks], blocks: [] });
    setMsg('旧栏目已转到补充里');
  }

  async function importWorld(file: File) {
    try {
      const text = await file.text();
      const j = JSON.parse(text) as World;
      if (!Array.isArray(j.blocks) && !Array.isArray(j.characters)) {
        setMsg('不是剧本文件：缺少 characters');
        return;
      }
      const next: World = {
        ...j,
        id: j.id || `w_${Date.now().toString(36)}`,
        title: j.title || '未命名剧本',
        extras: j.extras && j.extras.length ? j.extras : (j.blocks || []),
        blocks: [],
        updatedAt: Date.now(),
      };
      saveWorld(next);
      setW(next);
      setOpen(null);
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

  const legacy = !!(w?.blocks && w.blocks.length);

  const big = (
    label: string,
    key: keyof World & ('era' | 'rules' | 'places' | 'outline' | 'opening' | 'banned' | 'style'),
    rows: number,
    placeholder: string,
    tip?: string,
  ) => (
    <div className="field">
      <label>{label}</label>
      <textarea
        className="block-text"
        rows={rows}
        value={(w?.[key] as string) || ''}
        onChange={e => patch({ [key]: e.target.value } as Partial<World>)}
        placeholder={placeholder}
      />
      {tip && <div className="tip">{tip}</div>}
    </div>
  );

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">剧本</div>
          <div className="right">{msg}</div>
        </div>

        <div className="body">
          {!w ? (
            <>
              <div className="muted">还没有导入剧本，也可以直接从这里开始写。</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  onClick={() => {
                    const next: World = {
                      id: `w_${Date.now().toString(36)}`,
                      title: '未命名剧本',
                      updatedAt: Date.now(),
                      characters: [],
                      extras: [],
                    };
                    saveWorld(next);
                    setW(next);
                  }}
                >
                  新建
                </button>
                <button className="btn ghost" onClick={() => fileInput.current?.click()}>导入</button>
              </div>
            </>
          ) : (
            <>
              {legacy && (
                <div className="notice">
                  <div>这是一份旧档案，{w.blocks?.length} 个栏目还不在新结构里。</div>
                  <button className="mini" style={{ marginTop: 8 }} onClick={adoptBlocks}>转进补充</button>
                </div>
              )}

              <div className="tabs">
                <button className={`tab ${tab === 'base' ? 'on' : ''}`} onClick={() => setTab('base')}>基础</button>
                <button className={`tab ${tab === 'world' ? 'on' : ''}`} onClick={() => setTab('world')}>世界观</button>
                <button className={`tab ${tab === 'main' ? 'on' : ''}`} onClick={() => setTab('main')}>主线</button>
                <button className={`tab ${tab === 'play' ? 'on' : ''}`} onClick={() => setTab('play')}>玩法</button>
                <button className={`tab ${tab === 'file' ? 'on' : ''}`} onClick={() => setTab('file')}>文件</button>
              </div>

              {tab === 'base' && (
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
                  placeholder="原作、小说，或「自己的设定」"
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
                </>
              )}

              {tab === 'world' && (
                <>
              <div className="section-title">世界观</div>
              {big('时代与科技', 'era', 4, '什么年代，科技到哪一步，什么有、什么没有')}
              {big('核心规则', 'rules', 5, '这个世界怎么运转：谁能做什么，什么绝对不成立')}
              {big('重要场所与势力', 'places', 4, '她常去的地方、公司、旧街、酒馆，以及各自归谁')}

                </>
              )}

              {tab === 'main' && (
                <>
              <div className="section-title">主线</div>
              {big('大纲', 'outline', 8, '第一章 …\n第二章 …', '一章一行。模型按这个推进，也靠它判断该收尾了。')}
              {big('开场 / 序章', 'opening', 6, '开局那一段，从哪一刻写起')}

                </>
              )}

              {tab === 'world' && (
                <>
              <div className="section-title">规则与禁忌</div>
              {big('不可以出现', 'banned', 4, '比如：换脸、另一个男主被提起、公司里突然多出有名有姓的员工')}

              <div className="section-title">文风</div>
              {big('样本', 'style', 6, '贴一段你想要的感觉，模型会照着这个语感写', '比列十条规则都管用。')}

                </>
              )}

              {tab === 'play' && (
                <>
              <div className="section-title">数值</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                只定义名字、初值和上限，当前值存在存档里。模型每回合只能申报增减，不能直接改写。
                好感是内置的（每人 0–100），不用在这里重复加。
              </div>

              <div className="attr-sub">你的</div>
              {(w.attrs || []).map((a, i) => (
                <div className="attr-row" key={a.id}>
                  <input
                    className="attr-name"
                    value={a.name}
                    onChange={e => patchAttr(i, { name: e.target.value })}
                    placeholder="名字，如 金钱"
                  />
                  <input
                    className="attr-num"
                    type="number"
                    value={a.init}
                    onChange={e => patchAttr(i, { init: Number(e.target.value) || 0 })}
                    title="初始值"
                  />
                  <input
                    className="attr-num"
                    type="number"
                    value={a.max ?? ''}
                    onChange={e =>
                      patchAttr(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                    placeholder="上限"
                    title="留空＝无上限"
                  />
                  <button className="mini danger" onClick={() => dropAttr(i)}>×</button>
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <button className="mini" onClick={addAttr}>＋ 添加一条</button>
              </div>

              <div className="attr-sub" style={{ marginTop: 22 }}>角色的</div>
              {w.characters.filter(c => c.identity).length > 0 && (
                <select
                  className="attr-select"
                  value={attrChar}
                  onChange={e => setAttrChar(e.target.value)}
                >
                  {w.characters
                    .filter(c => c.identity)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              )}
              {(w.characters.find(c => c.id === attrChar)?.attrs || []).map((a, i) => (
                <div className="attr-row" key={a.id}>
                  <input
                    className="attr-name"
                    value={a.name}
                    onChange={e => patchCharAttr(i, { name: e.target.value })}
                    placeholder="名字，如 黑化度"
                  />
                  <input
                    className="attr-num"
                    type="number"
                    value={a.init}
                    onChange={e => patchCharAttr(i, { init: Number(e.target.value) || 0 })}
                    title="初始值"
                  />
                  <input
                    className="attr-num"
                    type="number"
                    value={a.max ?? ''}
                    onChange={e =>
                      patchCharAttr(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                    placeholder="上限"
                    title="留空＝无上限"
                  />
                  <button className="mini danger" onClick={() => dropCharAttr(i)}>×</button>
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <button className="mini" onClick={addCharAttr} disabled={!attrChar}>＋ 给他加一条</button>
              </div>

                </>
              )}

              {tab === 'main' && (
                <>
              <div className="section-title">补充</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                放不进上面任何一栏的散设定。按顺序接在最后交给模型。
              </div>

              {(w.extras || []).map((b, i) => (
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
                        onChange={e => patchExtra(i, { title: e.target.value })}
                        placeholder="栏目名"
                      />
                      <textarea
                        className="block-text"
                        value={b.content}
                        onChange={e => patchExtra(i, { content: e.target.value })}
                        rows={8}
                        placeholder="这一栏的内容"
                      />
                      <div className="block-actions">
                        <button className="mini" onClick={() => moveExtra(i, -1)}>上移</button>
                        <button className="mini" onClick={() => moveExtra(i, 1)}>下移</button>
                        <button className="mini danger" onClick={() => dropExtra(i)}>删除</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ marginTop: 14 }}>
                <button className="btn ghost" onClick={addExtra}>新增栏目</button>
              </div>

                </>
              )}

              {tab === 'file' && (
                <>
              <div className="section-title">文件</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => fileInput.current?.click()}>导入</button>
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
