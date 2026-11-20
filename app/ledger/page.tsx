'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { stageOf } from '@/lib/affinity';
import { listSaves, loadWorld } from '@/lib/store';
import type { AffinityEntry, Save, World } from '@/lib/types';

type Row = AffinityEntry & { saveId: string; saveTitle: string; kind2: string };

export default function LedgerPage() {
  const router = useRouter();
  const [saves, setSaves] = useState<Save[]>([]);
  const [world, setWorld] = useState<World | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setWorld(loadWorld());
    listSaves().then(rows => {
      setSaves(rows);
      setLoaded(true);
    });
  }, []);

  const rows: Row[] = saves
    .flatMap(s =>
      (s.state?.log || []).map(e => ({
        ...e,
        saveId: s.id,
        saveTitle: s.title,
        kind2: s.kind,
      })),
    )
    .sort((a, b) => b.at - a.at);

  const charName = (id: string) =>
    world?.characters.find(c => c.id === id)?.name || rows.find(r => r.characterId === id)?.characterName || id;

  const charAttrName = (cid: string, aid: string) =>
    world?.characters.find(c => c.id === cid)?.attrs?.find(a => a.id === aid)?.name || aid;

  const attrName = (aid: string) => world?.attrs?.find(a => a.id === aid)?.name || aid;

  const current = saves
    .map(s => {
      const st = s.state;
      if (!st) return null;
      const mine = Object.entries(st.attrs || {});
      const chars = Object.entries(st.affinity || {});
      const extras = Object.entries(st.charAttrs || {}).filter(([, m]) => Object.keys(m).length);
      if (!mine.length && !chars.length && !extras.length) return null;
      return { save: s, mine, chars, extras, time: st.time, place: st.place };
    })
    .filter(Boolean) as {
      save: Save;
      mine: [string, number][];
      chars: [string, number][];
      extras: [string, Record<string, number>][];
      time?: string;
      place?: string;
    }[];

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">结算日志</div>
          <div className="right">{rows.length} 条</div>
        </div>

        <div className="body">
          {current.length > 0 && (
            <>
              <div className="section-title">当前状态</div>
              {current.map(c => (
                <div key={c.save.id} className="ledger-card">
                  <div className="ledger-card-top">
                    <span>{c.save.title}</span>
                    <span className="muted">
                      {c.time || '—'}
                      {c.place ? ` · ${c.place}` : ''}
                    </span>
                  </div>
                  {c.chars.map(([id, v]) => (
                    <div key={id} className="ledger-bar">
                      <span>{charName(id)}</span>
                      <span className="muted">{stageOf(v)}</span>
                      <span className="val">{v}</span>
                    </div>
                  ))}
                  {c.extras.map(([cid, map]) => (
                    <div key={cid} className="ledger-bar">
                      <span>{charName(cid)}</span>
                      <span className="muted">
                        {Object.entries(map)
                          .map(([aid, v]) => `${charAttrName(cid, aid)} ${v}`)
                          .join('　')}
                      </span>
                    </div>
                  ))}
                  {c.mine.map(([aid, v]) => (
                    <div key={aid} className="ledger-bar">
                      <span>你</span>
                      <span className="muted">{attrName(aid)}</span>
                      <span className="val">{v}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          <div className="section-title" style={{ marginTop: 26 }}>涨跌记录</div>

          {!loaded && <div className="muted">读取中……</div>}
          {loaded && rows.length === 0 && (
            <div className="muted">还没有记录。去跑一回合，模型申报的每一笔都会落在这里。</div>
          )}

          {rows.map(r => {
            const expanded = open === r.id;
            const isAttr = r.kind === 'attr';
            return (
              <div key={r.id} className="log-item" onClick={() => setOpen(expanded ? null : r.id)}>
                <div className="log-head">
                  <span className={`delta ${r.delta > 0 ? 'up' : 'down'}`}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </span>
                  <span className="who">{isAttr ? r.attrName : r.characterName}</span>
                  <span className="muted">{r.before} → {r.after}</span>
                  {!isAttr && <span className="muted">{r.stage}</span>}
                  {isAttr && <span className="muted">{r.characterName}</span>}
                  <span className="muted" style={{ marginLeft: 'auto' }}>{r.saveTitle}</span>
                </div>
                <div className="log-why">{r.reason}</div>
                <div className="log-meta">
                  {r.time || '—'}
                  {r.place ? ` · ${r.place}` : ''}　第 {Math.floor(r.turnIndex / 2) + 1} 回合
                </div>
                {expanded && (
                  <div className="log-debug">
                    <div className="k">模型申报</div>
                    <pre>{r.raw || '（无）'}</pre>
                    <div className="k">本回合注入</div>
                    <div className="muted">{(r.injected || []).join(' · ') || '（无）'}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
