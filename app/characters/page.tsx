'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  delVoiceClip,
  listVoiceClips,
  loadWallpaper,
  loadWorld,
  newId,
  saveWorld,
} from '@/lib/store';
import type { Character, VoiceClip, World } from '@/lib/types';

const splitKw = (v: string) => v.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);

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

export default function CharactersPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [wall, setWall] = useState('');
  const [role, setRole] = useState<'self' | 'lead' | 'npc'>('self');
  const [openId, setOpenId] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceClip[]>([]);
  const [playing, setPlaying] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setWorld(loadWorld());
    setWall(loadWallpaper().url);
    listVoiceClips().then(setVoices).catch(() => {});
  }, []);

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

  function commit(next: World) {
    next.updatedAt = Date.now();
    setWorld({ ...next });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveWorld({ ...next }), 350);
  }

  function patch(id: string, p: Partial<Character>) {
    if (!world) return;
    const characters = (world.characters || []).map(c => (c.id === id ? { ...c, ...p } : c));
    commit({ ...world, characters });
  }

  function patchSelf(p: Partial<NonNullable<World['self']>>) {
    if (!world) return;
    commit({ ...world, self: { ...(world.self || {}), ...p } });
  }

  function add() {
    if (!world || role === 'self') return;
    const c: Character = {
      id: newId('c'),
      name: role === 'npc' ? '新 NPC' : '新角色',
      role,
      ...(role === 'npc' ? { mode: 'keyword' as const, keywords: [] } : {}),
    };
    commit({ ...world, characters: [...(world.characters || []), c] });
    setOpenId(c.id);
  }

  function drop(id: string) {
    if (!world) return;
    if (!confirm('删除这个人物？')) return;
    commit({ ...world, characters: (world.characters || []).filter(c => c.id !== id) });
    setOpenId(null);
  }

  const list = role === 'self' ? [] : (world?.characters || []).filter(c => (c.role || 'lead') === role);
  const places = world?.placeList || [];

  return (
    <main className="page">
      <div
        className={`wallpaper${wall ? '' : ' default'}`}
        style={wall ? { backgroundImage: `url(${wall})` } : undefined}
      />
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/world')}>返回</button>
          <div className="title">人物</div>
          <div className="right">{world?.characters.length ? `${world.characters.length} 人` : ''}</div>
        </div>

        <div className="body">
          {!world && <div className="muted">还没有剧本。先去剧本里新建或导入。</div>}

          {world && (
            <>
              <div className="tabs">
                <button className={`tab ${role === 'self' ? 'on' : ''}`} onClick={() => { setRole('self'); setOpenId(null); }}>
                  我
                </button>
                <button className={`tab ${role === 'lead' ? 'on' : ''}`} onClick={() => { setRole('lead'); setOpenId(null); }}>
                  主角
                </button>
                <button className={`tab ${role === 'npc' ? 'on' : ''}`} onClick={() => { setRole('npc'); setOpenId(null); }}>
                  NPC
                </button>
              </div>

              {role === 'self' ? (
                <div className="block-card open" style={{ marginTop: 14 }}>
                  <div className="block-body">
                    <div className="field">
                      <label>名字</label>
                      <input
                        value={world.self?.name || ''}
                        onChange={e => patchSelf({ name: e.target.value })}
                        placeholder="你的名字"
                      />
                    </div>
                    <div className="field">
                      <label>年龄</label>
                      <input
                        value={world.self?.age || ''}
                        onChange={e => patchSelf({ age: e.target.value })}
                        placeholder="如 29"
                      />
                    </div>
                    <div className="field">
                      <label>身份</label>
                      <input
                        value={world.self?.role || ''}
                        onChange={e => patchSelf({ role: e.target.value })}
                        placeholder="如 星核互娱的老板"
                      />
                    </div>
                    <div className="field">
                      <label>别人怎么称呼你</label>
                      <input
                        value={world.self?.called || ''}
                        onChange={e => patchSelf({ called: e.target.value })}
                        placeholder="如 老板、小姐、直呼名字"
                      />
                      <div className="tip">四个人的叫法可以不一样，在这里写清大致的规矩。</div>
                    </div>
                    <div className="field">
                      <label>说话习惯</label>
                      <input
                        value={world.self?.speech || ''}
                        onChange={e => patchSelf({ speech: e.target.value })}
                        placeholder="你说话的语感、常用词"
                      />
                    </div>
                    <div className="field">
                      <label>其他资料</label>
                      <textarea
                        className="block-text"
                        rows={6}
                        value={world.self?.note || world.protagonist || ''}
                        onChange={e => patchSelf({ note: e.target.value })}
                        placeholder="性格、习惯、怕什么、在意什么"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="tip" style={{ marginBottom: 10 }}>
                    {role === 'lead'
                      ? '主角＝能开个人线的人，有好感度，会涨会掉。'
                      : 'NPC＝按关键词或地区出现的人，没有好感，不抢主线。'}
                  </div>

              {list.map(c => (
                <div className="block-card" key={c.id}>
                  <button className="block-head" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <span className="n">{c.name.slice(0, 1) || '·'}</span>
                    )}
                    <span className="t">{c.name || '未命名'}</span>
                    <span className="len">{c.identity || '—'}</span>
                  </button>

                  {openId === c.id && (
                    <div className="block-body">
                      <div className="field">
                        <label>名字</label>
                        <input value={c.name} onChange={e => patch(c.id, { name: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>年龄</label>
                        <input
                          value={c.age || ''}
                          onChange={e => patch(c.id, { age: e.target.value })}
                          placeholder="如 27"
                        />
                      </div>
                      <div className="field">
                        <label>身份</label>
                        <input
                          value={c.identity || ''}
                          onChange={e => patch(c.id, { identity: e.target.value })}
                          placeholder={role === 'lead' ? '如 旧街零件铺老板' : '如 画廊主人'}
                        />
                      </div>
                      <div className="field">
                        <label>说话方式</label>
                        <input
                          value={c.speech || ''}
                          onChange={e => patch(c.id, { speech: e.target.value })}
                          placeholder="他说话的语感、口头禅"
                        />
                      </div>
                      <div className="field">
                        <label>个人资料</label>
                        <textarea
                          className="block-text"
                          rows={5}
                          value={c.note || ''}
                          onChange={e => patch(c.id, { note: e.target.value })}
                          placeholder="性格、经历、在意的事"
                        />
                      </div>

                      {(() => {
                        const mine = voices.filter(
                          v => v.characterId === c.id && (!world?.id || v.worldId === world.id),
                        );
                        return (
                          <div className="voice-lib">
                            <div className="voice-lib-head">
                              <span>语音库</span>
                              <span>{mine.length ? `${mine.length} 条` : ''}</span>
                            </div>
                            {!mine.length && (
                              <div className="tip">
                                在剧情里点台词右上角的收藏键，他的声音会存到这里，可以反复听。
                              </div>
                            )}
                            {mine.map(v => (
                              <div className="voice-row" key={v.id}>
                                <button
                                  className={`voice-play${playing === v.id ? ' on' : ''}`}
                                  onClick={() => playVoice(v)}
                                  title={playing === v.id ? '停止' : '播放'}
                                >
                                  {playing === v.id ? <IconStop /> : <IconPlay />}
                                </button>
                                <div className="voice-text">{v.text}</div>
                                <button
                                  className="mini danger"
                                  onClick={() => dropVoice(v.id)}
                                  title="删除这条收藏"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {role === 'npc' && (
                        <>
                          <div className="field">
                            <label>关键词</label>
                            <input
                              value={(c.keywords || []).join('、')}
                              onChange={e => patch(c.id, { keywords: splitKw(e.target.value) })}
                              placeholder="提到这些词就出现，如 林大小姐、画廊"
                            />
                          </div>
                          <div className="field">
                            <label>出现方式</label>
                            <select
                              value={c.mode || 'keyword'}
                              onChange={e => patch(c.id, { mode: e.target.value as Character['mode'] })}
                            >
                              <option value="keyword">关键词 · 说到才出现</option>
                              <option value="dynamic">动态 · 命中后持续几轮</option>
                              <option value="always">常驻 · 一直在场</option>
                            </select>
                          </div>
                          {c.mode === 'dynamic' && (
                            <div className="field">
                              <label>持续轮数</label>
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={String(c.rounds ?? 2)}
                                onChange={e =>
                                  patch(c.id, { rounds: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })
                                }
                              />
                            </div>
                          )}
                          <div className="field">
                            <label>所属地区</label>
                            <select
                              value={c.region || ''}
                              onChange={e => patch(c.id, { region: e.target.value || undefined })}
                            >
                              <option value="">不绑定</option>
                              {places.map((p, i) => (
                                <option key={i} value={p.title}>{p.title}</option>
                              ))}
                              {c.region && !places.some(p => p.title === c.region) && (
                                <option value={c.region}>{c.region}（不在场所列表里）</option>
                              )}
                            </select>
                            {!places.length && (
                              <div className="tip">先去「剧本 → 世界观 → 场所与势力」添加地点。</div>
                            )}
                          </div>
                        </>
                      )}

                      <div className="block-actions">
                        <button className="mini danger" onClick={() => drop(c.id)}>删除</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {!list.length && <div className="muted" style={{ fontSize: 12 }}>还没有人物。</div>}

              <div style={{ marginTop: 14 }}>
                <button className="btn ghost" onClick={add}>＋ 新增{role === 'npc' ? ' NPC' : '主角'}</button>
              </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
