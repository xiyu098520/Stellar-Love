'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { activeProfile, blankProfile, loadSettings, loadWorld, saveSettings } from '@/lib/store';
import { chat } from '@/lib/llm';
import type { ApiKind, ApiProfile, Character, Settings } from '@/lib/types';

const TABS: { k: ApiKind; t: string; note: string }[] = [
  { k: 'story', t: '剧情', note: '写正文的那一套。主线、个人线、番外都走它。' },
  { k: 'assistant', t: '助手', note: '归总、摘要、整理存档用的那一套。便宜的小模型就够。' },
  { k: 'tts', t: '语音', note: '朗读台词与旁白。目前先存配置，朗读接在阅读器里。' },
  { k: 'image', t: '图像', note: '立绘、插图、CG。目前先存配置。' },
];

function newId(): string {
  return `api_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export default function ApiSettingsPage() {
  const router = useRouter();
  const [s, setS] = useState<Settings>({ profiles: [], active: {} });
  const [tab, setTab] = useState<ApiKind>('story');
  const [msg, setMsg] = useState('');
  const [presetName, setPresetName] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [leads, setLeads] = useState<Character[]>([]);

  useEffect(() => {
    setS(loadSettings());
    const w = loadWorld();
    setLeads(w ? w.characters.filter(c => c.role !== 'npc' && c.name.trim()) : []);
  }, []);

  const list = s.profiles.filter(p => p.kind === tab);
  const cur = activeProfile(s, tab);

  function commit(next: Settings) {
    saveSettings(next);
    setS(next);
  }

  function patch(p: Partial<ApiProfile>) {
    commit({
      ...s,
      profiles: s.profiles.map(x => (x.id === cur.id ? { ...x, ...p } : x)),
    });
  }

  function usePreset(id: string) {
    commit({ ...s, active: { ...s.active, [tab]: id } });
  }

  function addPreset() {
    const name = presetName.trim() || `预设 ${list.length + 1}`;
    const p: ApiProfile = { ...cur, id: newId(), name };
    commit({
      ...s,
      profiles: [...s.profiles, p],
      active: { ...s.active, [tab]: p.id },
    });
    setPresetName('');
    setMsg(`已存为「${name}」`);
  }

  function dropPreset(id: string) {
    const rest = s.profiles.filter(p => p.id !== id);
    const own = rest.filter(p => p.kind === tab);
    let active = s.active;
    if (s.active[tab] === id) {
      if (own.length) active = { ...active, [tab]: own[0].id };
      else {
        const blank = blankProfile(tab);
        rest.push(blank);
        active = { ...active, [tab]: blank.id };
      }
    }
    commit({ ...s, profiles: rest, active });
    setMsg('已删除');
  }

  async function fetchModels() {
    const base = cur.baseUrl.trim().replace(/\/+$/, '');
    if (!base) {
      setMsg('先填 API 地址');
      return;
    }
    setFetching(true);
    setMsg('读取模型…');
    try {
      const res = await fetch(`${base}/models`, {
        headers: cur.apiKey ? { Authorization: `Bearer ${cur.apiKey}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows: unknown[] = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
          ? data.models
          : [];
      const ids = rows
        .map((m: any) => (typeof m === 'string' ? m : m?.id || m?.name))
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .sort();
      if (!ids.length) throw new Error('没读到模型列表');
      setModels(ids);
      setMsg(`读到 ${ids.length} 个模型`);
    } catch (e) {
      setModels([]);
      setMsg('读取失败：' + (e instanceof Error ? e.message : '没有响应'));
    } finally {
      setFetching(false);
    }
  }

  async function test() {
    setTesting(true);
    setMsg('测试中…');
    try {
      if (tab === 'tts') {
        const base = cur.baseUrl.trim().replace(/\/+$/, '');
        if (!base) throw new Error('先填 API 地址');
        const res = await fetch(`${base}/voices`, {
          headers: cur.apiKey ? { 'xi-api-key': cur.apiKey } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const n = Array.isArray(data?.voices) ? data.voices.length : 0;
        setMsg(`通了，${n} 个音色`);
        return;
      }
      if (tab === 'image') {
        setMsg('图像接口要真生成一张才能验证');
        return;
      }
      await chat(cur, [{ role: 'user', content: '回一个字：好' }], { maxTokens: 8 });
      setMsg('通了');
    } catch (e) {
      setMsg('失败：' + (e instanceof Error ? e.message : '没有响应'));
    } finally {
      setTesting(false);
    }
  }

  const isChat = tab === 'story' || tab === 'assistant';

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/settings')}>返回</button>
          <div className="title">接口</div>
          <div className="right">{msg}</div>
        </div>

        <div className="body">
          <div className="tabs">
            {TABS.map(t => (
              <button
                key={t.k}
                className={`tab${tab === t.k ? ' on' : ''}`}
                onClick={() => { setTab(t.k); setMsg(''); setModels([]); }}
              >
                {t.t}
              </button>
            ))}
          </div>

          <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>{TABS.find(t => t.k === tab)?.note}</div>

          <div className="section-title">预设</div>
          <div className="chips">
            {list.map(p => (
              <span key={p.id} className={`chip${p.id === cur.id ? ' on' : ''}`} onClick={() => usePreset(p.id)}>
                {p.name}
                {list.length > 1 && (
                  <b
                    className="x"
                    onClick={e => { e.stopPropagation(); dropPreset(p.id); }}
                  >
                    ×
                  </b>
                )}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              className="preset-input"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              placeholder="新预设名字"
            />
            <button className="btn ghost" onClick={addPreset}>存为预设</button>
          </div>

          <div className="section-title">{cur.name}</div>

          <div className="field">
            <label>API 地址</label>
            <input
              value={cur.baseUrl}
              onChange={e => patch({ baseUrl: e.target.value })}
              placeholder={tab === 'tts' ? 'https://api.elevenlabs.io/v1' : 'https://your-proxy.example.com/v1'}
            />
            <div className="tip">填到 /v1 为止，程序会自动接 /chat/completions。</div>
          </div>

          <div className="field">
            <label>密钥</label>
            <input
              value={cur.apiKey}
              onChange={e => patch({ apiKey: e.target.value })}
              placeholder="sk-..."
              type="password"
            />
            <div className="tip">只存在这台设备的浏览器里，不会上传到别处。</div>
          </div>

          <div className="field">
            <label>模型</label>
            <input
              value={cur.model}
              onChange={e => patch({ model: e.target.value })}
              placeholder={tab === 'tts' ? 'eleven_multilingual_v2' : 'gemini-3.8-flash'}
            />
            {tab !== 'tts' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <button className="mini" onClick={fetchModels} disabled={fetching}>
                  {fetching ? '读取中…' : '拉取模型列表'}
                </button>
                <span className="muted" style={{ fontSize: 11 }}>
                  点下面的名字就会自动填进来；读取失败多半是接口没开跨域，手填也行
                </span>
              </div>
            )}
            {tab !== 'tts' && models.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                {models.slice(0, 40).map(m => (
                  <span
                    key={m}
                    className={`chip${cur.model === m ? ' on' : ''}`}
                    onClick={() => patch({ model: m })}
                  >
                    {m}
                  </span>
                ))}
                {models.length > 40 && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    还有 {models.length - 40} 个，直接手填也行
                  </span>
                )}
              </div>
            )}
          </div>

          {isChat && (
            <div className="field">
              <label>温度（0 - 2）</label>
              <input
                value={String(cur.temperature ?? (tab === 'story' ? 0.9 : 0.3))}
                onChange={e => patch({ temperature: Number(e.target.value) || 0 })}
                placeholder="0.9"
              />
              <div className="tip">
                {tab === 'story' ? '越高越发散，恋爱向建议 0.85 到 1.0。' : '归总建议 0.2 到 0.4，别让它发挥。'}
              </div>
            </div>
          )}

          {tab === 'tts' && (
            <>
              <div className="field">
                <label>默认音色（旁白、无名路人用）</label>
                <input
                  value={cur.voiceId || ''}
                  onChange={e => patch({ voiceId: e.target.value })}
                  placeholder="voice_id"
                />
                <div className="tip">下面没单独配的角色，都会用这个音色。</div>
              </div>

              {leads.length === 0 && (
                <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                  现在剧本里还没有主角。去「人物」里加人之后，这里就会列出每个人。
                </div>
              )}

              {leads.map(c => (
                <div className="field" key={c.id}>
                  <label>{c.name}的音色</label>
                  <input
                    value={cur.voices?.[c.id] || ''}
                    onChange={e =>
                      patch({ voices: { ...(cur.voices || {}), [c.id]: e.target.value } })
                    }
                    placeholder={cur.voiceId || 'voice_id'}
                  />
                </div>
              ))}

              <div className="field">
                <label>语速</label>
                <input
                  value={String(cur.speed ?? 1)}
                  onChange={e => patch({ speed: Number(e.target.value) || 1 })}
                  placeholder="1"
                />
              </div>
              <div className="field">
                <label>语言</label>
                <div className="chips" style={{ marginTop: 8 }}>
                  <span className={`chip${cur.lang === 'zh' ? ' on' : ''}`} onClick={() => patch({ lang: 'zh' })}>中文</span>
                  <span className={`chip${cur.lang === 'ja' ? ' on' : ''}`} onClick={() => patch({ lang: 'ja' })}>日文</span>
                </div>
              </div>
            </>
          )}

          {tab === 'image' && (
            <div className="field">
              <label>尺寸</label>
              <input
                value={cur.size || ''}
                onChange={e => patch({ size: e.target.value })}
                placeholder="1024x1536"
              />
              <div className="tip">角色立绘用竖图，场景插图用横图。</div>
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn ghost" onClick={test} disabled={testing}>
              {testing ? '测试中…' : '测一下'}
            </button>
            <span className="muted" style={{ fontSize: 11 }}>
              {tab === 'image' ? '图像接口要真出图才能验证' : '会真的发一次请求'}
            </span>
          </div>

          <div className="tip" style={{ marginTop: 24 }}>改哪里存哪里，不用按保存。</div>
        </div>
      </div>
    </main>
  );
}
