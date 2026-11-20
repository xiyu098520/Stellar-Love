'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { emptyState } from '@/lib/affinity';
import { assistantCount } from '@/lib/chapter';
import { clockText, initClock } from '@/lib/clock';
import { delSave, listSaves, loadWorld, newId, putSave } from '@/lib/store';
import type { Save, World } from '@/lib/types';

function kindText(s: Save) {
  if (s.kind === 'main') return '主线';
  if (s.kind === 'route') return '个人线';
  return '番外';
}

function when(t: number) {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SavesPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [saves, setSaves] = useState<Save[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');

  useEffect(() => {
    (async () => {
      const w = loadWorld();
      setWorld(w);
      setSaves(await listSaves());
      setLoaded(true);
    })();
  }, []);

  async function createMain() {
    if (!world) return;
    const now = Date.now();
    const clock = initClock(world);
    const n = saves.filter(s => s.worldId === world.id && s.kind === 'main').length + 1;
    const next: Save = {
      id: newId('main'),
      worldId: world.id,
      worldTitle: world.title,
      kind: 'main',
      title: n > 1 ? `主线 ${n}` : '主线',
      turns: [],
      relations: [],
      state: { ...emptyState(), clock, time: clockText(clock) },
      createdAt: now,
      updatedAt: now,
    };
    await putSave(next);
    router.push(`/play?save=${next.id}`);
  }

  function startRename(s: Save) {
    setEditing(s.id);
    setDraft(s.title);
  }

  async function finishRename(s: Save) {
    const title = draft.trim();
    if (!title) return;
    const next: Save = { ...s, title };
    await putSave(next);
    setSaves(rows => rows.map(x => (x.id === next.id ? next : x)));
    setEditing('');
  }

  async function remove(s: Save) {
    if (!confirm(`删除存档「${s.title}」？删掉就找不回来了。`)) return;
    await delSave(s.id);
    setSaves(rows => rows.filter(x => x.id !== s.id));
  }

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">存档</div>
          <div className="right">{saves.length} 份</div>
        </div>

        <div className="body">
          {!loaded && <div className="muted">读取中……</div>}

          {loaded && !world && <div className="muted">还没有剧本。先去剧本里新建或导入。</div>}

          {loaded && world && (
            <div style={{ marginBottom: 10 }}>
              <button className="btn ghost" onClick={createMain}>新建一份主线</button>
              <span className="muted" style={{ fontSize: 11, marginLeft: 10 }}>
                当前剧本：{world.title}
              </span>
            </div>
          )}

          {loaded && saves.length === 0 && <div className="muted">还没有存档。</div>}

          {saves.map(s => (
            <div key={s.id} className="save-row">
              <div className="save-head">
                {editing === s.id ? (
                  <>
                    <input
                      className="save-name"
                      value={draft}
                      autoFocus
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') finishRename(s);
                        if (e.key === 'Escape') setEditing('');
                      }}
                    />
                    <button className="mini" onClick={() => finishRename(s)}>保存</button>
                    <button className="mini" onClick={() => setEditing('')}>取消</button>
                  </>
                ) : (
                  <>
                    <span className="save-title">{s.title}</span>
                    <span className="muted">{kindText(s)}</span>
                    <span className="muted">{assistantCount(s.turns)} 回合</span>
                    <span className="muted" style={{ marginLeft: 'auto' }}>
                      {when(s.updatedAt)}
                    </span>
                  </>
                )}
              </div>

              {editing !== s.id && (
                <div className="save-meta">
                  <span className="muted">{s.worldTitle}</span>
                  {s.kind === 'route' && s.routeOf && (
                    <span className="muted">· {s.routeOf}</span>
                  )}
                </div>
              )}

              {editing !== s.id && (
                <div className="save-actions">
                  <button className="mini" onClick={() => router.push(`/play?save=${s.id}`)}>
                    打开
                  </button>
                  <button className="mini" onClick={() => startRename(s)}>改名</button>
                  <button className="mini danger" onClick={() => remove(s)}>删除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
