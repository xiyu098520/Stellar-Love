'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { stageOf, trustStageOf } from '@/lib/affinity';
import { chapterLabel } from '@/lib/chapter';
import { chat } from '@/lib/llm';
import { buildSummaryMessages } from '@/lib/prompt';
import { activeProfile, listSaves, loadSettings, loadWorld, putSave } from '@/lib/store';
import type { AffinityEntry, Save, Settings, Wallet, World } from '@/lib/types';
import { loadWallet } from '@/lib/wallet';

type Row = AffinityEntry & { saveId: string; saveTitle: string; kind2: string };

export default function LedgerPage() {
  const router = useRouter();
  const [saves, setSaves] = useState<Save[]>([]);
  const [world, setWorld] = useState<World | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState('');
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    const w = loadWorld();
    setWorld(w);
    setSettings(loadSettings());
    if (w) setWallet(loadWallet(w.id, w));
    listSaves().then(rows => {
      setSaves(rows);
      setLoaded(true);
    });
  }, []);

  /** 手动重摘一回合：跟跑剧情时用的是同一套提示词 */
  async function regen(save: Save, turnNo: number) {
    if (!world || !settings) return;
    const profile = activeProfile(settings, 'assistant');
    if (!profile.baseUrl.trim() || !profile.model.trim()) {
      alert('先到「设定 → 接口与预设」里配好助手接口。');
      return;
    }
    const assistants = save.turns.filter(t => t.role === 'assistant');
    const turn = assistants[turnNo - 1];
    if (!turn) return;
    const idx = save.turns.indexOf(turn);
    const prev = save.turns[idx - 1];
    const herWords = prev && prev.role === 'user' ? prev.text : '';
    const key = `${save.id}:${turnNo}`;
    setRunning(key);
    try {
      const raw = await chat(profile, buildSummaryMessages(world, save, turn, herWords), {
        maxTokens: 300,
      });
      const text = raw
        .replace(/["“”]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      if (!text) throw new Error('模型没给出摘要');
      const next: Save = {
        ...save,
        summaries: [
          ...(save.summaries || []).filter(s => s.turn !== turnNo),
          { turn: turnNo, text, at: Date.now() },
        ].sort((a, b) => a.turn - b.turn),
      };
      await putSave(next);
      setSaves(rows => rows.map(s => (s.id === next.id ? next : s)));
    } catch (e) {
      alert(e instanceof Error ? e.message : '生成失败');
    } finally {
      setRunning('');
    }
  }

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

  const summarySaves = saves.filter(s => s.turns.some(t => t.role === 'assistant'));

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
                      <span className="muted">{c.save.kind === 'main' ? trustStageOf(v) : stageOf(v)}</span>
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

          <div className="section-title" style={{ marginTop: 26 }}>回合摘要</div>
          {summarySaves.length === 0 && (
            <div className="muted">还没有回合。跑一回合，后台就会摘一条放在这里。</div>
          )}
          {summarySaves.map(s => {
            const assistants = s.turns.filter(t => t.role === 'assistant');
            const sums = new Map((s.summaries || []).map(x => [x.turn, x.text]));
            return (
              <div key={s.id} className="ledger-card">
                <div className="ledger-card-top">
                  <span>{s.title}</span>
                  <span className="muted">
                    {s.kind === 'main' ? '主线' : s.kind === 'route' ? '个人线' : '番外'} · {assistants.length} 回合
                  </span>
                </div>
                {assistants.map((t, i) => {
                  const no = i + 1;
                  const text = sums.get(no);
                  const key = `${s.id}:${no}`;
                  return (
                    <div key={no} className="sum-row">
                      <div className="sum-head">
                        <span>{s.kind === 'main' ? chapterLabel(no) : `第 ${no} 回合`}</span>
                        <span className="muted">{t.time || ''}</span>
                        <button
                          className="mini"
                          disabled={running === key}
                          onClick={() => regen(s, no)}
                        >
                          {running === key ? '生成中' : text ? '重新生成' : '生成'}
                        </button>
                      </div>
                      <div className={text ? 'sum-text' : 'sum-text empty'}>
                        {text || '还没生成'}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="section-title" style={{ marginTop: 26 }}>钱与账目</div>
          {!wallet && <div className="muted">还没有开始，所以还没钱。</div>}
          {wallet && (
            <div className="ledger-card">
              <div className="ledger-card-top">
                <span>余额 {wallet.money} 金</span>
                <span className="muted">抽卡币 {wallet.coins}</span>
              </div>
              {wallet.ledger.length === 0 && (
                <div className="muted">还没有进出。剧情里赚的、花的，都会记在这里。</div>
              )}
              {[...wallet.ledger]
                .sort((a, b) => b.at - a.at)
                .map(e => (
                  <div className="ledger-bar" key={e.id}>
                    <span className={e.amount > 0 ? 'delta up' : 'delta down'}>
                      {e.amount > 0 ? `+${e.amount}` : e.amount}
                    </span>
                    <span>{e.reason}</span>
                    <span className="muted" style={{ marginLeft: 'auto' }}>
                      {e.time || ''}
                      {e.place ? ` · ${e.place}` : ''}
                    </span>
                  </div>
                ))}
            </div>
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
