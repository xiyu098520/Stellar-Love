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
import type { AttrDef, EventEntry, ExtraStory, Item, World, WorldBlock } from '@/lib/types';

const splitKw = (v: string) => v.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);

const modeText: Record<string, string> = {
  always: '全局',
  keyword: '关键词',
  dynamic: '动态',
  place: '地点',
  off: '关闭',
};

const EV_KINDS: { k: EventEntry['kind']; label: string }[] = [
  { k: 'always', label: '信息' },
  { k: 'festival', label: '节日' },
  { k: 'event', label: '事件' },
];

const DEFAULT_RELATIONS = `- 主线由事件推动，不围着任何一个男主转：他们是办事时遇到的人，不是目的。
- 一段主线同时最多让一位男主成为主要对手戏；其他人只以办事的身份短暂出现，一次不超过一场，不留私密记忆。
- 主线里好感最高到 30，说破心意、确立关系只能发生在个人线。
- 四个男主永远不会同时在场，也互不相识；当前线里另一个男主的名字不出现、不被提起。
- 换线时全员认知重排：助理认识所有人，但标签随当前线变化；公司里只有无名员工，永远不缺人。`;

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

  function patchItem(i: number, p: Partial<Item>) {
    if (!w) return;
    commit({ ...w, items: (w.items || []).map((it, j) => (j === i ? { ...it, ...p } : it)) });
  }

  function addItem() {
    if (!w) return;
    commit({
      ...w,
      items: [...(w.items || []), { id: newId(), name: '', price: 0, shop: '杂货店', kind: 'daily' }],
    });
  }

  function dropItem(i: number) {
    if (!w) return;
    commit({ ...w, items: (w.items || []).filter((_, j) => j !== i) });
  }

  function patchSpecial(i: number, p: Partial<ExtraStory>) {
    if (!w) return;
    commit({ ...w, specials: (w.specials || []).map((s, j) => (j === i ? { ...s, ...p } : s)) });
  }

  function addSpecial() {
    if (!w) return;
    commit({ ...w, specials: [...(w.specials || []), { id: newId(), title: '', content: '', unlock: 'gacha' }] });
  }

  function dropSpecial(i: number) {
    if (!w) return;
    commit({ ...w, specials: (w.specials || []).filter((_, j) => j !== i) });
  }

  function seedItems() {
    if (!w) return;
    const base: Item[] = [
      { id: newId(), name: '珍珠奶茶', price: 18, shop: '奶茶店', kind: 'daily' },
      { id: newId(), name: '手冲咖啡', price: 32, shop: '咖啡店', kind: 'daily' },
      { id: newId(), name: '便利店便当', price: 25, shop: '便利店', kind: 'daily' },
      { id: newId(), name: '热牛奶', price: 12, shop: '便利店', kind: 'daily' },
      { id: newId(), name: '领带夹', price: 680, shop: '日用品店', kind: 'gift' },
      { id: newId(), name: '全息花束', price: 220, shop: '花店', kind: 'gift' },
      { id: newId(), name: '机械零件套装', price: 450, shop: '零件铺', kind: 'gift' },
      { id: newId(), name: '旧唱片', price: 160, shop: '旧货店', kind: 'gift' },
      { id: newId(), name: '义体保养油', price: 90, shop: '日用品店', kind: 'daily' },
      { id: newId(), name: '降噪耳机', price: 1200, shop: '电器店', kind: 'gift' },
      { id: newId(), name: '便携数据盘', price: 300, shop: '电器店', kind: 'daily' },
      { id: newId(), name: '手写便签本', price: 45, shop: '文具店', kind: 'gift' },
    ];
    const have = new Set((w.items || []).map(i => i.name));
    commit({ ...w, items: [...(w.items || []), ...base.filter(i => !have.has(i.name))] });
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
    key: 'era' | 'rules' | 'relations' | 'currency' | 'outline' | 'opening' | 'banned' | 'style',
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

              <div className="field">
                <label>开局日期</label>
                <input
                  type="date"
                  value={w.startDate || ''}
                  onChange={e => patch({ startDate: e.target.value })}
                />
                <div className="tip">开局第一天。可以是未来年份，比如 2065 年。</div>
              </div>

              <div className="field">
                <label>开局时刻</label>
                <input
                  type="time"
                  value={w.startTime || ''}
                  onChange={e => patch({ startTime: e.target.value })}
                />
                <div className="tip">第一回合从几点开始。之后由模型报这一回合过了多少分钟，程序往下走，跨过午夜就进第二天。</div>
              </div>

              <div className="field">
                <label>初始资金</label>
                <input
                  inputMode="numeric"
                  value={w.initialMoney ?? ''}
                  onChange={e => {
                    const n = Number(e.target.value.replace(/[^\d-]/g, ''));
                    patch({ initialMoney: Number.isFinite(n) ? n : 0 });
                  }}
                  placeholder="比如 5000"
                />
                <div className="tip">主线和个人线共用这一份钱。之后剧情里赚的、花的，都记在账本里。</div>
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
              <div className="field">
                <label>关系规则</label>
                <textarea
                  className="block-text"
                  rows={7}
                  value={w.relations || ''}
                  onChange={e => patch({ relations: e.target.value })}
                  placeholder="几条线怎么互不干扰、换线时认知怎么变、谁能出现谁不能"
                />
                <div className="tip">比如：四个男主永不相遇；换线时全员认知重排；当前线里另一个人的名字不出现。</div>
                {!w.relations && (
                  <button
                    className="mini"
                    style={{ marginTop: 8 }}
                    onClick={() => patch({ relations: DEFAULT_RELATIONS })}
                  >
                    填入常用规则
                  </button>
                )}
              </div>
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
                          <option value="dynamic">动态 · 命中后持续几轮</option>
                          <option value="off">关闭 · 暂不使用</option>
                        </select>
                      </div>
                      {(p.mode === 'keyword' || p.mode === 'dynamic') && (
                        <div className="field">
                          <label>命中词</label>
                          <input
                            value={(p.keywords || []).join('、')}
                            onChange={e => patchPlace(i, { keywords: splitKw(e.target.value) })}
                            placeholder="多个用顿号隔开，如 西区、西城、码头那边"
                          />
                        </div>
                      )}
                      {p.mode === 'dynamic' && (
                        <div className="field">
                          <label>持续轮数</label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={String(p.rounds ?? 2)}
                            onChange={e => patchPlace(i, { rounds: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
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
              {big(
                '主线方向',
                'outline',
                5,
                '如：你是猎人小姐，主线是查清星核的来源',
                '只写核心线索，不写章节。主线没有终点，模型会一直挂着这条线往下接。',
              )}
              {big('开局', 'opening', 6, '开局那一段：时间、你在哪、在做什么。第一回合从这里接。', '必填。开局写得具体，第一回合才接得稳。')}
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
                {evTab === 'always'
                  ? '信息：平时不占篇幅，说到才带；也可以选全局，每回合都带。'
                  : evTab === 'festival'
                    ? '节日：日期临近或提到关键词时注入。'
                    : '事件：用关键词或地点触发，用结束词收尾。'}
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
                        <>
                          <div className="field">
                            <label>日期</label>
                            <input
                              value={e.date || ''}
                              onChange={ev => patchEvent(i, { date: ev.target.value })}
                              placeholder="如 12月24日"
                            />
                          </div>
                          <div className="field">
                            <label>提前几天开始注入</label>
                            <input
                              inputMode="numeric"
                              value={e.ahead ?? 2}
                              onChange={ev =>
                                patchEvent(i, { ahead: Math.max(0, Number(ev.target.value.replace(/[^\d]/g, '')) || 0) })
                              }
                            />
                            <div className="tip">提前就会把完整内容交给模型，让他能准备礼物、提前留意。</div>
                          </div>
                        </>
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
                          <option value="keyword">关键词 · 只在这一轮</option>
                          <option value="dynamic">动态 · 命中后持续几轮</option>
                          <option value="off">关闭 · 暂不使用</option>
                        </select>
                      </div>
                      {e.mode === 'dynamic' && (
                        <div className="field">
                          <label>持续轮数</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={e.rounds ?? 2}
                            onChange={ev => patchEvent(i, { rounds: Math.max(1, Number(ev.target.value) || 1) })}
                          />
                          <div className="tip">提到的那一轮 + 之后 N 轮；中途再提到会重新起算。</div>
                        </div>
                      )}
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

              <div className="section-title" style={{ marginTop: 26 }}>物品与商店</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                商店按「店铺」分组。有纪念意义的选礼物，会记进他收到的东西；奶茶、便当这类选日常，只进账本。
              </div>
              {(w.items || []).map((it, i) => (
                <div
                  key={it.id}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 72px 88px 68px 28px', gap: 6, marginTop: 8, alignItems: 'center' }}
                >
                  <input value={it.name} onChange={e => patchItem(i, { name: e.target.value })} placeholder="物品名" />
                  <input
                    inputMode="numeric"
                    value={it.price}
                    onChange={e => patchItem(i, { price: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                    placeholder="价格"
                  />
                  <input value={it.shop || ''} onChange={e => patchItem(i, { shop: e.target.value })} placeholder="店铺" />
                  <select value={it.kind || 'daily'} onChange={e => patchItem(i, { kind: e.target.value as Item['kind'] })}>
                    <option value="gift">礼物</option>
                    <option value="daily">日常</option>
                    <option value="collect">收藏</option>
                  </select>
                  <button className="mini danger" onClick={() => dropItem(i)}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="mini" onClick={addItem}>＋ 添加物品</button>
                <button className="mini" onClick={seedItems}>填入日常商品</button>
              </div>

              <div className="section-title" style={{ marginTop: 26 }}>番外</div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                番外先做框架：写标题、简介和正文，绑给某个人；抽到才会解锁。也可以设成免费，人物页里直接能看。
              </div>
              {(w.specials || []).map((s, i) => (
                <div className="block-card" key={s.id} style={{ marginTop: 8 }}>
                  <div className="block-body">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 76px 28px', gap: 6 }}>
                      <input value={s.title} onChange={e => patchSpecial(i, { title: e.target.value })} placeholder="标题" />
                      <select
                        value={s.characterId || ''}
                        onChange={e => patchSpecial(i, { characterId: e.target.value || undefined })}
                      >
                        <option value="">公共</option>
                        {(w.characters || []).filter(c => c.role !== 'npc').map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <select value={s.unlock || 'gacha'} onChange={e => patchSpecial(i, { unlock: e.target.value as ExtraStory['unlock'] })}>
                        <option value="gacha">抽卡</option>
                        <option value="free">免费</option>
                      </select>
                      <button className="mini danger" onClick={() => dropSpecial(i)}>×</button>
                    </div>
                    <input
                      value={s.desc || ''}
                      onChange={e => patchSpecial(i, { desc: e.target.value })}
                      placeholder="一句话简介"
                      style={{ marginTop: 6 }}
                    />
                    <textarea
                      className="block-text"
                      rows={5}
                      value={s.content}
                      onChange={e => patchSpecial(i, { content: e.target.value })}
                      placeholder="番外正文"
                      style={{ marginTop: 6 }}
                    />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <button className="mini" onClick={addSpecial}>＋ 添加番外</button>
              </div>
            </>
          )}

          {msg && <div className="tip" style={{ marginTop: 12 }}>{msg}</div>}
        </div>
      </div>
    </main>
  );
}
