'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { loadWorld, newId, saveWorld } from '@/lib/store';
import type { Character, World } from '@/lib/types';

const splitKw = (v: string) => v.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);

const ROLE_META = [
  { k: 'self' as const, num: '01', label: '我', en: 'PROTAGONIST' },
  { k: 'lead' as const, num: '02', label: '主角', en: 'LEAD' },
  { k: 'npc' as const, num: '03', label: 'NPC', en: 'CAST' },
];

function Field({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: ReactNode;
}) {
  return (
    <label className="ch-field">
      <span>{label}</span>
      {children}
      {tip ? <em className="ch-tip">{tip}</em> : null}
    </label>
  );
}

export default function CharactersPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [role, setRole] = useState<'self' | 'lead' | 'npc'>('self');
  const [openId, setOpenId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setWorld(loadWorld());
  }, []);

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
  const total = (world?.characters || []).length;

  return (
    <main className="ch-stage">
      <div className="ch-head">
        <button className="ch-back" onClick={() => router.push('/world')}>返回</button>
        <b>人物</b>
        <span>{world && total ? `${total} 人` : ''}</span>
      </div>

      <div className="ch-roles">
        {ROLE_META.map(m => (
          <button
            key={m.k}
            className={role === m.k ? 'on' : ''}
            onClick={() => { setRole(m.k); setOpenId(null); }}
          >
            <i>{m.num}</i>
            <span>{m.label}</span>
            <em>{m.en}</em>
          </button>
        ))}
      </div>

      <div className="ch-scroll">
        {!world && <div className="ch-empty">还没有剧本。先去剧本里新建或导入。</div>}

        {world && role === 'self' && (
          <section className="ch-card open">
            <div className="ch-sec">
              <i>01</i>
              <span>PROTAGONIST</span>
              <em>我</em>
            </div>
            <Field label="名字">
              <input
                value={world.self?.name || ''}
                onChange={e => patchSelf({ name: e.target.value })}
                placeholder="你的名字"
              />
            </Field>
            <Field label="年龄">
              <input
                value={world.self?.age || ''}
                onChange={e => patchSelf({ age: e.target.value })}
                placeholder="如 29"
              />
            </Field>
            <Field label="生日" tip="和节日一样，提前两天让模型和各角色知道。">
              <input
                value={world.self?.birthday || ''}
                onChange={e => patchSelf({ birthday: e.target.value })}
                placeholder="如 9月20日"
              />
            </Field>
            <Field label="身份">
              <input
                value={world.self?.role || ''}
                onChange={e => patchSelf({ role: e.target.value })}
                placeholder="如 星核互娱的老板"
              />
            </Field>
            <Field label="别人怎么称呼你" tip="四个人的叫法可以不一样，在这里写清大致的规矩。">
              <input
                value={world.self?.called || ''}
                onChange={e => patchSelf({ called: e.target.value })}
                placeholder="如 老板、小姐、直呼名字"
              />
            </Field>
            <Field label="说话习惯">
              <input
                value={world.self?.speech || ''}
                onChange={e => patchSelf({ speech: e.target.value })}
                placeholder="你说话的语感、常用词"
              />
            </Field>
            <Field label="其他资料">
              <textarea
                rows={6}
                value={world.self?.note || world.protagonist || ''}
                onChange={e => patchSelf({ note: e.target.value })}
                placeholder="性格、习惯、怕什么、在意什么"
              />
            </Field>
          </section>
        )}

        {world && role !== 'self' && (
          <>
            <p className="ch-note">
              {role === 'lead'
                ? '主角＝能开个人线的人，有好感度，会涨会掉。'
                : 'NPC＝按关键词或地区出现的人，没有好感，不抢主线。'}
            </p>

            {list.map((c, i) => (
              <div className={`ch-card ${openId === c.id ? 'open' : ''}`} key={c.id}>
                <button className="ch-row" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                  <span className="ch-seal">
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar} alt="" />
                    ) : (
                      c.name.slice(0, 1) || '·'
                    )}
                  </span>
                  <span className="ch-name">{c.name || '未命名'}</span>
                  <span className="ch-ident">{c.identity || '—'}</span>
                  <i className="ch-no">{String(i + 1).padStart(2, '0')}</i>
                </button>

                {openId === c.id && (
                  <div className="ch-panel">
                    <Field label="名字">
                      <input value={c.name} onChange={e => patch(c.id, { name: e.target.value })} />
                    </Field>
                    <Field label="年龄">
                      <input
                        value={c.age || ''}
                        onChange={e => patch(c.id, { age: e.target.value })}
                        placeholder="如 27"
                      />
                    </Field>
                    <Field label="生日" tip="和节日一样，提前两天让模型知道，好准备礼物。">
                      <input
                        value={c.birthday || ''}
                        onChange={e => patch(c.id, { birthday: e.target.value })}
                        placeholder="如 9月14日"
                      />
                    </Field>
                    <Field label="身份">
                      <input
                        value={c.identity || ''}
                        onChange={e => patch(c.id, { identity: e.target.value })}
                        placeholder={role === 'lead' ? '如 旧街零件铺老板' : '如 画廊主人'}
                      />
                    </Field>
                    <Field label="说话方式">
                      <input
                        value={c.speech || ''}
                        onChange={e => patch(c.id, { speech: e.target.value })}
                        placeholder="他说话的语感、口头禅"
                      />
                    </Field>
                    <Field
                      label="音色 ID"
                      tip="跟着这个角色走，存在剧本里。朗读他台词时用这个音色；音色列表在「设定 → 接口 → 语音」里拉取。"
                    >
                      <input
                        value={c.voiceId || ''}
                        onChange={e => patch(c.id, { voiceId: e.target.value })}
                        placeholder="留空就用接口页的默认音色"
                      />
                    </Field>
                    <Field label="个人资料">
                      <textarea
                        rows={5}
                        value={c.note || ''}
                        onChange={e => patch(c.id, { note: e.target.value })}
                        placeholder="性格、经历、在意的事"
                      />
                    </Field>

                    {role === 'npc' && (
                      <>
                        <Field label="关键词">
                          <input
                            value={(c.keywords || []).join('、')}
                            onChange={e => patch(c.id, { keywords: splitKw(e.target.value) })}
                            placeholder="提到这些词就出现，如 林大小姐、画廊"
                          />
                        </Field>
                        <Field label="出现方式">
                          <select
                            value={c.mode || 'keyword'}
                            onChange={e => patch(c.id, { mode: e.target.value as Character['mode'] })}
                          >
                            <option value="keyword">关键词 · 说到才出现</option>
                            <option value="dynamic">动态 · 命中后持续几轮</option>
                            <option value="always">常驻 · 一直在场</option>
                          </select>
                        </Field>
                        {c.mode === 'dynamic' && (
                          <Field label="持续轮数">
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={String(c.rounds ?? 2)}
                              onChange={e =>
                                patch(c.id, { rounds: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })
                              }
                            />
                          </Field>
                        )}
                        <Field label="所属地区">
                          <select
                            value={c.region || ''}
                            onChange={e => patch(c.id, { region: e.target.value || undefined })}
                          >
                            <option value="">不绑定</option>
                            {places.map((p, idx) => (
                              <option key={idx} value={p.title}>{p.title}</option>
                            ))}
                            {c.region && !places.some(p => p.title === c.region) && (
                              <option value={c.region}>{c.region}（不在场所列表里）</option>
                            )}
                          </select>
                          {!places.length && (
                            <em className="ch-tip">先去「剧本 → 世界观 → 场所与势力」添加地点。</em>
                          )}
                        </Field>
                        <label className="ch-check">
                          <input
                            type="checkbox"
                            checked={!!c.contact}
                            onChange={e => patch(c.id, { contact: e.target.checked || undefined })}
                          />
                          <span>手机里能联系到</span>
                        </label>
                        <em className="ch-tip" style={{ padding: '0 16px 4px' }}>
                          勾上之后，主线和个人线的手机通讯录里都会有这个人。
                        </em>
                      </>
                    )}

                    <button className="ch-del" onClick={() => drop(c.id)}>删除这个人物</button>
                  </div>
                )}
              </div>
            ))}

            {!list.length && <div className="ch-empty">还没有人物，点下面新增。</div>}

            <button className="ch-add" onClick={add}>＋ 新增{role === 'npc' ? ' NPC' : '主角'}</button>
          </>
        )}
      </div>
    </main>
  );
}
