'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { stageOf } from '@/lib/affinity';
import { listSaves } from '@/lib/store';
import type { AffinityEntry, Save } from '@/lib/types';

type Row = AffinityEntry & { saveId: string; saveTitle: string; kind: string };

export default function LedgerPage() {
  const router = useRouter();
  const [saves, setSaves] = useState<Save[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
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
        kind: s.kind,
      })),
    )
    .sort((a, b) => b.at - a.at);

  const current = saves
    .map(s => {
      const st = s.state;
      if (!st || !Object.keys(st.affinity).length) return null;
      const items = Object.entries(st.affinity).map(([id, v]) => {
        const name = rows.find(r => r.characterId === id)?.characterName || id;
        return { id, name, v };
      });
      return { save: s, items, time: st.time, place: st.place };
    })
    .filter(Boolean) as { save: Save; items: { id: string; name: string; v: number }[]; time?: string; place?: string }[];

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
                    <span className="muted">{c.time || '—'}{c.place ? ` · ${c.place}` : ''}</span>
                  </div>
                  {c.items.map(it => (
                    <div key={it.id} className="ledger-bar">
                      <span>{it.name}</span>
                      <span className="muted">{stageOf(it.v)}</span>
                      <span className="val">{it.v}</span>
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
            return (
              <div key={r.id} className="log-item" onClick={() => setOpen(expanded ? null : r.id)}>
                <div className="log-head">
                  <span className={`delta ${r.delta > 0 ? 'up' : 'down'}`}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </span>
                  <span className="who">{r.characterName}</span>
                  <span className="muted">{r.before} → {r.after}</span>
                  <span className="muted">{r.stage}</span>
                  <span className="muted" style={{ marginLeft: 'auto' }}>{r.saveTitle}</span>
                </div>
                <div className="log-why">{r.reason}</div>
                <div className="log-meta">
                  {r.time || '—'}{r.place ? ` · ${r.place}` : ''}　第 {Math.floor(r.turnIndex / 2) + 1} 回合
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
