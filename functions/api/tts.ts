type Body = {
  apiKey?: string;
  baseUrl?: string;
  voiceId?: string;
  text?: string;
  model?: string;
  speed?: number;
  previousText?: string;
  nextText?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestPost(context: any) {
  let body: Body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: '请求不完整' }, 400);
  }

  const apiKey = (body.apiKey || '').trim();
  const text = (body.text || '').trim();
  const voiceId = (body.voiceId || '').trim();
  const model = (body.model || '').trim() || 'eleven_multilingual_v2';
  const base = ((body.baseUrl || '').trim() || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');

  if (!apiKey) return json({ error: '语音设置里没有 Key' }, 400);
  if (!text) return json({ error: '这句是空的' }, 400);

  const eleven = /elevenlabs/i.test(base) || /^eleven/i.test(model);

  try {
    if (eleven) {
      if (!voiceId) return json({ error: '这个人还没有音色 ID' }, 400);

      // 用音色在 ElevenLabs 后台存的那套参数
      let settings: Record<string, unknown> = { stability: 0.5, similarity_boost: 0.75 };
      try {
        const r = await fetch(`${base}/voices/${encodeURIComponent(voiceId)}/settings`, {
          headers: { 'xi-api-key': apiKey },
        });
        if (r.ok) {
          const d: any = await r.json();
          settings = {
            stability: typeof d.stability === 'number' ? d.stability : 0.5,
            similarity_boost: typeof d.similarity_boost === 'number' ? d.similarity_boost : 0.75,
            style: typeof d.style === 'number' ? d.style : 0,
            use_speaker_boost: typeof d.use_speaker_boost === 'boolean' ? d.use_speaker_boost : true,
          };
        }
      } catch {}

      const v3 = /v[3-9]/i.test(model);
      const speed =
        typeof body.speed === 'number' && body.speed >= 0.7 && body.speed <= 1.2
          ? body.speed
          : undefined;
      // v3 起不认 speed，传了会 400
      if (speed && !v3) settings = { ...settings, speed };

      const payload: Record<string, unknown> = {
        text,
        model_id: model,
        voice_settings: settings,
      };
      // 前后文只有 v3 及以后支持
      if (v3) {
        if (body.previousText?.trim()) payload.previous_text = body.previousText.trim().slice(-200);
        if (body.nextText?.trim()) payload.next_text = body.nextText.trim().slice(0, 200);
      }

      const r = await fetch(`${base}/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const detail = await r.text();
        return json({ error: `ElevenLabs 返回 ${r.status}：${detail.slice(0, 160)}` }, 502);
      }
      return new Response(r.body, {
        headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
      });
    }

    // OpenAI 兼容的 /audio/speech
    const r = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'tts-1',
        input: text,
        voice: voiceId || 'alloy',
        speed: body.speed || 1,
        response_format: 'mp3',
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return json({ error: `语音接口 ${r.status}：${detail.slice(0, 160)}` }, 502);
    }
    return new Response(r.body, {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '连不上语音服务' }, 502);
  }
}
