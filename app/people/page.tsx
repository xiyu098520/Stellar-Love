'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { delVoiceClip, listSaves, listVoiceClips, loadWorld } from '@/lib/store';
import { bondOf, groupByMonth, knowDays, memoriesOf } from '@/lib/bond';
import type { Character, Save, VoiceClip, Wallet, World } from '@/lib/types';
import { loadWallet } from '@/lib/wallet';

const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M8.5 5.5l9.5 6.5-9.5 6.5z" strokeLinejoin="round" />
  </svg>
);

const IconStop = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
);

export default function PeoplePage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [saves, setSaves] = useState<Save[]>([]);
  const [voices, setVoices] = useState<VoiceClip[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pickedId, setPickedId] = useState('');
  const [tab, setTab] = useState<'profile' | 'memory'>('profile');
  const [playing, setPlaying] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      const w = loadWorld();
      setWorld(w);
      if (w) setWallet(loadWallet(w.id, w));
      setSaves(await listSaves());
      setVoices(await listVoiceClips().catch(() => []));
      setLoaded(true);
    })();
  }, []);

  const leads = world ? world.characters.filter(c => c.role !== 'npc') : [];
  const main = world ? saves.find(s => s.worldId === world.id && s.kind === 'main') : undefined;

  /** 每个人的拾光轴和羁绊，一次性算好 */
  const cast = useMemo(() => {
    if (!world) return [];
    const known = knowDays(world, main);
    return leads
      .map(c => {
        const memories = memoriesOf({ character: c, world, saves, voices, wallet });
        return { c, memories, bond: bondOf(memories, known) };
      })
      .sort((a, b) => b.bond.score - a.bond.score);
  }, [world, leads, saves, voices, wallet, main]);

  const picked = cast.find(x => x.c.id === pickedId);

  function playVoice(v: VoiceClip) {
    if (playing === v.id) {
      audioRef.current?.pause();
      setPlaying('');
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(v.audio);
    audioRef.current = audio;
    setPlaying(v.id);
    audio.onended = () => setPlaying('');
    audio.play().catch(() => setPlaying(''));
  }

  async function dropVoice(id: string) {
    try {
      await delVoiceClip(id);
      setVoices(prev => prev.filter(v => v.id !== id));
      if (playing === id) {
        audioRef.current?.pause();
        setPlaying('');
      }
    } catch {}
  }

  function back() {
    audioRef.current?.pause();
    setPlaying('');
    if (pickedId) {
      setPickedId('');
      setTab('profile');
    } else {
      router.push('/');
    }
  }

  const groups = picked ? groupByMonth(picked.memories) : [];

  return (
    <main className="pc">
      <div className="pc-bg" />

      {!loaded && <div className="pc-hint">读取中……</div>}
      {loaded && !world && <div className="pc-hint">还没有剧本。</div>}

      {/* ---------- 列表 ---------- */}
      {loaded && world && !picked && (
        <div className="pc-screen">
          <header className="pc-head">
            <button className="pc-back" onClick={back}>返回</button>
            <div className="pc-title"><b>人物</b><i>CAST</i></div>
            <div className="pc-count">{String(leads.length).padStart(2, '0')}</div>
          </header>

          <div className="pc-scroll">
            {!leads.length && <div className="pc-hint">剧本里还没有主角。</div>}

            {cast.map(x => {
              const c = x.c;
              const last = x.memories[0];
              return (
                <button key={c.id} className="pc-row" onClick={() => setPickedId(c.id)}>
                  <div
                    className={`pc-art${c.avatar ? ' has' : ''}`}
                    style={c.avatar ? { backgroundImage: `url(${c.avatar})` } : undefined}
                  >
                    <span>{c.name.slice(0, 1)}</span>
                  </div>
                  <div className="pc-row-info">
                    <div className="pc-row-name">{c.name}</div>
                    <div className="pc-row-id">
                      {[c.identity, c.region].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="pc-row-last">
                      {last ? `最近　${last.title}` : '还没有记录'}
                    </div>
                  </div>
                  <div className="pc-row-right">
                    <b>{x.bond.score}</b>
                    <i>羁绊</i>
                    <em>相伴 {x.bond.companion} 天</em>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- 详情 ---------- */}
      {loaded && world && picked && (
        <div className="pc-screen">
          <div className="pc-hero">
            <div
              className={`pc-hero-art${picked.c.avatar ? ' has' : ''}`}
              style={picked.c.avatar ? { backgroundImage: `url(${picked.c.avatar})` } : undefined}
            >
              <span>{picked.c.name.slice(0, 1)}</span>
            </div>
            <button className="pc-back pc-hero-back" onClick={back}>返回</button>
            <div className="pc-vname">{picked.c.name}</div>
            <div className="pc-stamp">
              {picked.bond.known ? `已相遇 ${picked.bond.known} 天` : '尚未记录'}
            </div>
            <div className="pc-hero-id">
              {[picked.c.identity, picked.c.region].filter(Boolean).join(' · ')}
            </div>
          </div>

          <div className="pc-bond">
            <div className="pc-bb-top">
              <b>{picked.bond.score}</b>
              <i>羁绊</i>
              <em>{picked.bond.level}</em>
            </div>
            <div className="pc-bb-bar"><i style={{ width: `${picked.bond.progress * 100}%` }} /></div>
            <div className="pc-stats">
              <div><b>{picked.bond.known}</b><em>相识天数</em></div>
              <div><b>{picked.bond.companion}</b><em>相伴天数</em></div>
              <div><b>{picked.bond.story}</b><em>共同经历</em></div>
              <div><b>{picked.bond.voice}</b><em>收藏语音</em></div>
            </div>
          </div>

          <div className="pc-tabs">
            <button
              className={tab === 'profile' ? 'on' : ''}
              onClick={() => setTab('profile')}
            >
              资料<em>PROFILE</em>
            </button>
            <button
              className={tab === 'memory' ? 'on' : ''}
              onClick={() => setTab('memory')}
            >
              拾光轴<em>MEMORY</em>
            </button>
          </div>

          {tab === 'profile' && (
            <div className="pc-pane">
              <div className="pc-kv">
                <div><em>身份</em><span>{picked.c.identity || '—'}</span></div>
                <div><em>所属地区</em><span>{picked.c.region || '—'}</span></div>
                <div><em>生日</em><span>{picked.c.birthday || '—'}</span></div>
                <div><em>年龄</em><span>{picked.c.age || '—'}</span></div>
                {(picked.c.fields || []).map((f, i) => (
                  <div key={i}><em>{f.k || '—'}</em><span>{f.v || '—'}</span></div>
                ))}
              </div>

              {picked.c.speech && (
                <>
                  <div className="pc-sub"><b>说话习惯</b><i>SPEECH</i></div>
                  <div className="pc-note">{picked.c.speech}</div>
                </>
              )}

              <div className="pc-sub"><b>备注</b><i>NOTE</i></div>
              <div className="pc-note">{picked.c.note || '还没有写备注。'}</div>

              {!!(picked.c.keywords || []).length && (
                <>
                  <div className="pc-sub"><b>关键词</b><i>KEYWORDS</i></div>
                  <div className="pc-chips">
                    {(picked.c.keywords || []).map((k, i) => <span key={i}>{k}</span>)}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'memory' && (
            <div className="pc-pane">
              {!picked.memories.length && (
                <div className="pc-hint">
                  还没有记录。剧情回合、他送的东西、收藏的语音都会自动记在这里。
                </div>
              )}

              {groups.map(g => (
                <div key={g.key}>
                  <div className="pc-month">
                    <b>{g.name}</b>
                    <i>{`${g.items.length} 条`}</i>
                  </div>
                  <div className="pc-mem">
                    {g.items.map(m => (
                      <div className="pc-memo" key={m.id}>
                        <div className="pc-md">
                          {m.label || '—'}
                          <span className={`pc-kind k-${m.kind}`}>
                            {m.kind === 'story' ? '剧情' : m.kind === 'gift' ? '赠礼' : '语音'}
                          </span>
                        </div>
                        <div className="pc-mt">{m.title}</div>
                        {m.text && <div className="pc-mx">{m.text}</div>}
                        {m.kind === 'voice' && (() => {
                          const v = voices.find(x => m.id === `vc_${x.id}`);
                          if (!v) return null;
                          return (
                            <div className="pc-voice">
                              <button
                                className={`pc-play${playing === v.id ? ' on' : ''}`}
                                onClick={() => playVoice(v)}
                                title={playing === v.id ? '停止' : '播放'}
                              >
                                {playing === v.id ? <IconStop /> : <IconPlay />}
                              </button>
                              <span>反复听</span>
                              <button className="pc-drop" onClick={() => dropVoice(v.id)}>×</button>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
