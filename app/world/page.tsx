'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  activeWorldId,
  deleteWorld,
  listWorlds,
  newId,
  saveWorld,
  setActiveWorld,
} from '@/lib/store';
import type { AttrDef, EventEntry, World, WorldBlock } from '@/lib/types';

const splitKw = (v: string) => v.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);

const modeText: Record<string, string> = {
  always: '全局',
  keyword: '关键词',
  place: '地点',
  off: '关闭',
};

const EV_KINDS: { k: EventEntry['kind']; label: string }[] = [
  { k: 'festival', label: '节日' },
  { k: 'always', label: '常驻' },
  { k: 'dynamic', label: '动态' },
  { k: 'event', label: '事件' },
];

type Tab = 'base' | 'world' | 'main' | 'event' | 'play';

export default function WorldPage() {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [worlds, setWorlds] = useState<World[]>([]);
  const [activeId, setActiveId] = useState('');
  const [w, setW] = useState<World | null>(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('base');
  const [evTab, setEvTab] = useState<EventEntry['kind']>('event');
  const [q, setQ] = useState('');
  const [attrChar, setAttrChar] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = () => {
    setWorlds(listWorlds());
    setActiveId(activeWorldId());
  };

  useEffect(() => {
    refresh();
  }, []);

  function openEdit(id: string) {
    const target = listWorlds().find(x => x.id === id);
    if (!target) return;
    setW(target);
    setView('edit');
    setTab('base');
    setOpen(null);
    setMsg('');
    setQ('');
    const first = target.characters.find(c => c.role !== 'npc');
    setAttrChar(first?.id || '');
  }

  function backToList() {
    if (timer.current) clearTimeout(timer.current);
    if (w) saveWorld(w);
    setW(null);
    setView('list');
    refresh();
  }

  function commit(next: World) {
    next.updatedAt = Date.now();
    setW({ ...next });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveWorld({ ...next });
      refresh();
    }, 350);
  }

  function patch(p: Partial<World>) {
    if (!w) return;
    commit({ ...w, ...p });
  }

  function patchPlace(i: number, p: Partial<WorldBlock>) {
    if (!w) return;
    const placeList = (w.placeList || []).map((b, j) => (j === i ? { ...b, ...p } : b));
    commit({ ...w, placeList });
  }

  function addPlace() {
    if (!w) return;
    const placeList = [...(w.placeList || []), { title: '', content: '', mode: 'always' as const }];
    commit({ ...w, placeList });
    setOpen(`p${placeList.length - 1}`);
  }

  function dropPlace(i: number) {
    if (!w) return;
    commit({ ...w, placeList: (w.placeList || []).filter((_, j) => j !== i) });
    setOpen(null);
  }

  function patchEvent(i: number, p: Partial<EventEntry>) {
    if (!w) return;
    const events = (w.events || []).map((b, j) => (j === i ? { ...b, ...p } : b));
    commit({ ...w, events });
  }

  function addEvent() {
    if (!w) return;
    const events = [
      ...(w.events || []),
      { title: '', content: '', kind: evTab, mode: evTab === 'always' ? ('always' as const) : ('keyword' as const) },
    ];
    commit({ ...w, events });
    setOpen(`e${events.length - 1}`);
  }

  function dropEvent(i: number) {
    if (!w) return;
    commit({ ...w, events: (w.events || []).filter((_, j) => j !== i) });
    setOpen(null);
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

  function createWorld() {
    const next: World = {
      id: `w_${Date.now().toString(36)}`,
      title: '未命名剧本',
      updatedAt: Date.now(),
      characters: [],
      events: [],
      placeList: [],
    };
    saveWorld(next);
    refresh();
    openEdit(next.id);
  }

  async function importWorld(file: File) {
    try {
      const text = await file.text();
      const j = JSON.parse(text) as World;
      if (!Array.isArray(j.blocks) && !Array.isArray(j.characters) && !Array.isArray(j.events)) {
        setMsg('不是剧本文件：缺少 characters / events');
        return;
      }
      const next: World = {
        ...j,
        id: listWorlds().some(x => x.id === j.id) ? newId('w') : j.id || newId('w'),
        title: j.title || '未命名剧本',
        updatedAt: Date.now(),
      };
      saveWorld(next);
      refresh();
      setMsg(`已导入：${next.title}`);
    } catch (e) {
      setMsg('导入失败：' + (e instanceof Error ? e.message : '文件格式不对'));
    }
  }

  function exportWorld(target: World) {
    const blob = new Blob([JSON.stringify(target, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${target.title || 'world'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const big = (
    label: string,
    key: 'era' | 'rules' | 'currency' | 'outline' | 'opening' | 'banned' | 'style',
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

  /* ---------- 列表页 ---------- */

  if (view === 'list') {
    return (
      <main className="page">
        <div className="sheet">
          <div className="topbar">
            <button className="back" onClick={() => router.push('/')}>返回</button>
            <div className="title">剧本</div>
            <div className="right">{worlds.length ? `${worlds.length} 个` : ''}</div>
          </div>

          <div className="body">
            {!worlds.length && (
              <div className="muted">还没有剧本。新建一个，或导入以前导出的文件。</div>
            )}

            {worlds.map(x => (
              <div
                key={x.id}
                style={{
                  padding: '14px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, letterSpacing: '.06em' }}>{x.title || '未命名剧本'}</span>
                  {x.id === activeId && (
                    <span className="block-mode">使用中</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {[x.tagline, `${x.characters?.length || 0} 人`].filter(Boolean).join(' · ')}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="mini" onClick={() => openEdit(x.id)}>编辑</button>
                  <button
                    className="mini"
                    disabled={x.id === activeId}
                    onClick={() => {
                      setActiveWorld(x.id);
                      refresh();
                      setMsg(`已切换到：${x.title}`);
                    }}
                  >
                    {x.id === activeId ? '正在使用' : '使用'}
                  </button>
                  <button className="mini" onClick={() => exportWorld(x)}>导出</button>
                  <button
                    className="mini danger"
                    onClick={() => {
                      if (!confirm(`删除「${x.title}」？存档不会跟着删，但会找不到这个剧本。`)) return;
                      deleteWorld(x.id);
                      refresh();
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn" onClick={createWorld}>新建</button>
              <button className="btn ghost" onClick={() => fileInput.current?.click()}>导入</button>
            </div>

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

            {msg && <div className="tip" style={{ marginTop: 12 }}>{msg}</div>}
          </div>
        </div>
      </main>
    );
  }

  /* ---------- 编辑页 ---------- */

  if (!w) {
    return (
      <main className="page">
        <div className="sheet">
          <div className="topbar">
            <button className="back" onClick={backToList}>返回</button>
            <div className="title">剧本</div>
            <div className="right" />
          </div>
          <div className="body">
            <div className="muted">这个剧本不见了，回列表看看。</div>
          </div>
        </div>
      </main>
    );
  }

  const events = w.events || [];
  const filtered = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => (e.kind || 'event') === evTab)
    .filter(({ e }) => {
      const s = q.trim();
      if (!s) return true;
      return (
        (e.title || '').includes(s) ||
        (e.desc || '').includes(s) ||
        (e.content || '').includes(s) ||
        (e.keywords || []).some(k => k.includes(s))
      );
    });

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={backToList}>返回</button>
          <div className="title">{w.title || '剧本'}</div>
          <div className="right">{msg}</div>
        </div>

        <div className="body">
          <div className="tabs">
            <button className={`tab ${tab === 'base' ? 'on' : ''}`} onClick={() => setTab('base')}>基础</button>
            <button className={`tab ${tab === 'world' ? 'on' : ''}`} onClick={() => setTab('world')}>世界观</button>
            <button className={`tab ${tab === 'main' ? 'on' : ''}`} onClick={() => setTab('main')}>主线</button>
            <button className={`tab ${tab === 'event' ? 'on' : ''}`} onClick={() => setTab('event')}>事件</button>
            <button className={`tab ${tab === 'play' ? 'on' : ''}`} onClick={() => setTab('play')}>玩法</button>
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
                <span className="v">
                  {(w.characters || []).filter(c => c.role !== 'npc').length} 主角 ·{' '}
                  {(w.characters || []).filter(c => c.role === 'npc').length} NPC
                </span>
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
              {big('货币系统', 'currency', 4, '这里的钱叫什么、怎么换算，比如 1 星币约等于 10 元')}

              <div className="section-title">场所与势力</div>
              {(w.placeList || []).map((p, i) => (
                <div className="block-card" key={i}>
                  <button className="block-head" onClick={() => setOpen(open === `p${i}` ? null : `p${i}`)}>
                    <span className="t">{p.title || '未命名地点'}</span>
                    <span className="block-mode">{modeText[p.mode || 'always']}</span>
                    <span className="len">{(p.content || '').length}</span>
                  </button>
                  {open === `p${i}` && (
                    <div className="block-body">
                      <input
                        className="block-title"
                        value={p.title}
                        onChange={e => patchPlace(i, { title: e.target.value })}
                        placeholder="地点名称，如 西区"
                      />
                      <div className="field">
                        <label>注入内容</label>
                        <textarea
                          className="block-text"
                          rows={6}
                          value={p.content}
                          onChange={e => patchPlace(i, { content: e.target.value })}
                          placeholder="这个地方长什么样、归谁、有什么规矩"
                        />
                      </div>
                      <div className="field">
                        <label>注入方式</label>
                        <select
                          value={p.mode || 'always'}
                          onChange={e => patchPlace(i, { mode: e.target.value as WorldBlock['mode'] })}
                        >
                          <option value="always">全局 · 每回合都带</option>
                          <option value="keyword">关键词 · 说到才带</option>
                          <option value="off">关闭 · 暂不使用</option>
                        </select>
                      </div>
                      {p.mode === 'keyword' && (
                        <div className="field">
                          <label>命中词</label>
                          <input
                            value={(p.keywords || []).join('、')}
                            onChange={e => patchPlace(i, { keywords: splitKw(e.target.value) })}
                            placeholder="多个用顿号隔开，如 西区、西城、码头那边"
                          />
                        </div>
                      )}
                      <div className="block-actions">
                        <button className="mini danger" onClick={() => dropPlace(i)}>删除</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <button className="btn ghost" onClick={addPlace}>＋ 添加地点</button>
              </div>

              <div className="section-title">规则与禁忌</div>
              {big('不可以出现', 'banned', 4, '比如：换脸、另一个男主被提起、公司里突然多出有名有姓的员工')}

              <div className="section-title">文风</div>
              {big('样本', 'style', 6, '贴一段你想要的感觉，模型会照着这个语感写', '比列十条规则都管用。')}
            </>
          )}

          {tab === 'main' && (
            <>
              <div className="section-title">主线</div>
              {big('大纲', 'outline', 8, '第一章 …\n第二章 …', '一章一行。模型按这个推进，也靠它判断该收尾了。')}
              {big('开场 / 序章', 'opening', 6, '开局那一段，从哪一刻写起')}
            </>
          )}

          {tab === 'event' && (
            <>
              <div className="tabs" style={{ marginBottom: 12 }}>
                {EV_KINDS.map(k => (
                  <button
                    key={k.k}
                    className={`tab ${evTab === k.k ? 'on' : ''}`}
                    onClick={() => setEvTab(k.k)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="搜索名称 / 关键词 / 内容"
                />
                <button className="mini" onClick={addEvent}>＋</button>
              </div>

              <div className="tip" style={{ margin: '10px 0' }}>
                {evTab === 'always' ? '常驻：每回合都会交给模型。' : '关键词命中时自动注入。'}
              </div>

              {filtered.map(({ e, i }) => (
                <div className="block-card" key={i}>
                  <button className="block-head" onClick={() => setOpen(open === `e${i}` ? null : `e${i}`)}>
                    <span className="t">{e.title || '未命名'}</span>
                    <span className="block-mode">{modeText[e.mode || 'always']}</span>
                    <span className="len">{e.date || (e.content || '').length}</span>
                  </button>
                  {open === `e${i}` && (
                    <div className="block-body">
                      <input
                        className="block-title"
                        value={e.title}
                        onChange={ev => patchEvent(i, { title: ev.target.value })}
                        placeholder="名称"
                      />
                      {evTab === 'festival' && (
                        <div className="field">
                          <label>日期</label>
                          <input
                            value={e.date || ''}
                            onChange={ev => patchEvent(i, { date: ev.target.value })}
                            placeholder="如 12月24日"
                          />
                        </div>
                      )}
                      <div className="field">
                        <label>简介</label>
                        <input
                          value={e.desc || ''}
                          onChange={ev => patchEvent(i, { desc: ev.target.value })}
                          placeholder="一句话说清这是什么"
                        />
                      </div>
                      <div className="field">
                        <label>关键词</label>
                        <input
                          value={(e.keywords || []).join('、')}
                          onChange={ev => patchEvent(i, { keywords: splitKw(ev.target.value) })}
                          placeholder="多个用顿号隔开"
                        />
                      </div>
                      <div className="field">
                        <label>完整内容</label>
                        <textarea
                          className="block-text"
                          rows={7}
                          value={e.content}
                          onChange={ev => patchEvent(i, { content: ev.target.value })}
                          placeholder="命中之后要交给模型的完整内容"
                        />
                      </div>
                      <div className="field">
                        <label>注入方式</label>
                        <select
                          value={e.mode || 'always'}
                          onChange={ev => patchEvent(i, { mode: ev.target.value as WorldBlock['mode'] })}
                        >
                          <option value="always">全局 · 每回合都带</option>
                          <option value="keyword">关键词 · 说到才带</option>
                          <option value="off">关闭 · 暂不使用</option>
                        </select>
                      </div>
                      <div className="block-actions">
                        <button className="mini danger" onClick={() => dropEvent(i)}>删除</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {!filtered.length && <div className="muted" style={{ fontSize: 12 }}>这一类还没有条目。</div>}
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
              {w.characters.filter(c => c.role !== 'npc').length > 0 && (
                <select
                  className="attr-select"
                  value={attrChar}
                  onChange={e => setAttrChar(e.target.value)}
                >
                  {w.characters
                    .filter(c => c.role !== 'npc')
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

          {msg && <div className="tip" style={{ marginTop: 12 }}>{msg}</div>}
        </div>
      </div>
    </main>
  );
}
