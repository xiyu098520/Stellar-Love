type Body = { apiKey?: string; baseUrl?: string };

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
  const base = ((body.baseUrl || '').trim() || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
  if (!apiKey) return json({ error: '先填 Key' }, 400);

  try {
    const r = await fetch(`${base}/voices`, {
      headers: { 'xi-api-key': apiKey, authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) {
      const detail = await r.text();
      return json({ error: `取音色返回 ${r.status}：${detail.slice(0, 140)}` }, 502);
    }
    const data: any = await r.json();
    const rows: any[] = Array.isArray(data?.voices)
      ? data.voices
      : Array.isArray(data?.data)
        ? data.data
        : [];
    const voices = rows
      .map(v => ({
        id: String(v?.voice_id || v?.id || v?.name || ''),
        name: String(v?.name || v?.voice_id || v?.id || ''),
      }))
      .filter(v => v.id);
    if (!voices.length) return json({ error: '这个 Key 下没取到音色' }, 502);
    return json({ voices });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '连不上语音服务' }, 502);
  }
}
