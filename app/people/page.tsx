'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { stageOf } from '@/lib/affinity';
import { delVoiceClip, listSaves, listVoiceClips, loadWorld } from '@/lib/store';
import type { Character, Save, VoiceClip, World } from '@/lib/types';

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
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<Character | null>(null);
  const [voices, setVoices] = useState<VoiceClip[]>([]);
  const [playing, setPlaying] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      setWorld(loadWorld());
      setSaves(await listSaves());
      setVoices(await listVoiceClips().catch(() => []));
      setLoaded(true);
    })();
  }, []);

  const main = world ? saves.find(s => s.worldId === world.id && s.kind === 'main') : undefined;
  const leads = world ? world.characters.filter(c => c.role !== 'npc') : [];

  function scoreOf(id: string) {
    const route = saves.find(
      s => s.kind === 'route' && s.routeOf === id && s.worldId === world?.id
    );
    return {
      main: main?.state?.affinity?.[id] ?? 0,
      route: route?.state?.affinity?.[id] ?? null,
    };
  }

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

  function close() {
    if (picked) {
      audioRef.current?.pause();
      setPlaying('');
      setPicked(null);
    } else {
      router.push('/');
    }
  }

  const mine = picked
    ? voices.filter(v => v.characterId === picked.id && (!world?.id || v.worldId === world.id))
    : [];

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={close}>
            返回
          </button>
          <div className="title">{picked ? picked.name : '人物'}</div>
          <div className="right">{picked ? '' : world ? `${leads.length} 位` : ''}</div>
        </div>

        <div className="body">
          {!loaded && <div className="muted">读取中……</div>}
          {loaded && !world && <div className="muted">还没有剧本。</div>}

          {loaded && world && !picked && (
            <>
              {!leads.length && <div className="muted">剧本里还没有主角。</div>}

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

              {picked.note && (
                <div className="field">
                  <label>个人资料</label>
                  <div style={{ fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                    {picked.note}
                  </div>
                </div>
              )}

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
            </>
          )}
        </div>
      </div>
    </main>
  );
}
