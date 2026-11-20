'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { stageOf } from '@/lib/affinity';
import { listSaves, loadWorld } from '@/lib/store';
import type { Character, Save, World } from '@/lib/types';

export default function PeoplePage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [saves, setSaves] = useState<Save[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<Character | null>(null);

  useEffect(() => {
    (async () => {
      setWorld(loadWorld());
      setSaves(await listSaves());
      setLoaded(true);
    })();
  }, []);

  const main = world ? saves.find(s => s.worldId === world.id && s.kind === 'main') : undefined;
  const leads = world ? world.characters.filter(c => c.role !== 'npc') : [];
  const npcs = world ? world.characters.filter(c => c.role === 'npc') : [];

  function scoreOf(id: string) {
    const route = saves.find(
      s => s.kind === 'route' && s.routeOf === id && s.worldId === world?.id
    );
    return {
      main: main?.state?.affinity?.[id] ?? 0,
      route: route?.state?.affinity?.[id] ?? null,
    };
  }

  function close() {
    if (picked) setPicked(null);
    else router.push('/');
  }

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={close}>
            返回
          </button>
          <div className="title">{picked ? picked.name : '人物'}</div>
          <div className="right">
            {picked ? '' : world ? `${leads.length} 位` : ''}
          </div>
        </div>

        <div className="body">
          {!loaded && <div className="muted">读取中……</div>}
          {loaded && !world && <div className="muted">还没有剧本。</div>}

          {loaded && world && !picked && (
            <>
              {world.self?.name && (
                <div className="card" style={{ marginBottom: 14 }}>
                  <div className="muted" style={{ fontSize: 11, letterSpacing: '.18em' }}>
                    我
                  </div>
                  <div style={{ fontSize: 17, marginTop: 6 }}>{world.self.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {[world.self.age && `${world.self.age} 岁`, world.self.role]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {world.self.note && (
                    <div style={{ fontSize: 13, marginTop: 10, lineHeight: 1.8 }}>
                      {world.self.note}
                    </div>
                  )}
                </div>
              )}

              <div className="muted" style={{ fontSize: 11, letterSpacing: '.18em', marginBottom: 8 }}>
                主角
              </div>

              {leads.map(c => {
                const s = scoreOf(c.id);
                return (
                  <button
                    key={c.id}
                    className="save-row"
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => setPicked(c)}
                  >
                    <div className="save-head">
                      <span className="avatar">{c.name.slice(0, 1)}</span>
                      <span className="save-title">{c.name}</span>
                      <span className="muted" style={{ marginLeft: 'auto' }}>
                        {s.route !== null
                          ? `个人线 ${s.route} · ${stageOf(s.route)}`
                          : `主线 ${s.main} · ${stageOf(s.main)}`}
                      </span>
                    </div>
                    {c.identity && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {c.identity}
                      </div>
                    )}
                  </button>
                );
              })}

              {npcs.length > 0 && (
                <>
                  <div
                    className="muted"
                    style={{ fontSize: 11, letterSpacing: '.18em', margin: '18px 0 8px' }}
                  >
                    其他人物
                  </div>
                  {npcs.map(c => (
                    <button
                      key={c.id}
                      className="save-row"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => setPicked(c)}
                    >
                      <div className="save-head">
                        <span className="avatar">{c.name.slice(0, 1)}</span>
                        <span className="save-title">{c.name}</span>
                        <span className="muted" style={{ marginLeft: 'auto' }}>
                          {c.region || 'NPC'}
                        </span>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          )}

          {loaded && world && picked && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <span className="avatar" style={{ width: 54, height: 54, fontSize: 20 }}>
                  {picked.name.slice(0, 1)}
                </span>
                <div>
                  <div style={{ fontSize: 20 }}>{picked.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {[picked.age && `${picked.age} 岁`, picked.identity]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                </div>
              </div>

              {picked.role !== 'npc' && (
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13 }}>
                    {(() => {
                      const s = scoreOf(picked.id);
                      return s.route !== null
                        ? `个人线 ${s.route} / 100 · ${stageOf(s.route)}（主线 ${s.main}）`
                        : `主线 ${s.main} / 100 · ${stageOf(s.main)}`;
                    })()}
                  </div>
                </div>
              )}

              {[
                ['性格与说话', picked.speech],
                ['个人资料', picked.note],
                ['身份', picked.identity],
              ].map(([label, value]) =>
                value ? (
                  <div className="field" key={label as string}>
                    <label>{label}</label>
                    <div style={{ fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                      {value}
                    </div>
                  </div>
                ) : null
              )}

              {picked.fields?.map(f => (
                <div className="field" key={f.k}>
                  <label>{f.k}</label>
                  <div style={{ fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{f.v}</div>
                </div>
              ))}

              {picked.role !== 'npc' && (
                <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
                  {['约会', '番外', '羁绊'].map(t => (
                    <div
                      key={t}
                      className="save-row"
                      style={{ display: 'flex', alignItems: 'center' }}
                    >
                      <span className="save-title">{t}</span>
                      <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                        还没做
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
