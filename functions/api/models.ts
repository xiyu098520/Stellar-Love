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
  const base = (body.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return json({ error: '先填 API 地址' }, 400);

  try {
    const eleven = /elevenlabs/i.test(base);
    const r = await fetch(`${base}/models`, {
      headers: apiKey ? (eleven ? { 'xi-api-key': apiKey } : { authorization: `Bearer ${apiKey}` }) : {},
    });
    if (!r.ok) {
      const detail = await r.text();
      return json({ error: `HTTP ${r.status}：${detail.slice(0, 140)}` }, 502);
    }
    const data: any = await r.json();
    const rows: any[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : Array.isArray(data)
          ? data
          : [];
    const models = rows
      .map(m => (typeof m === 'string' ? m : m?.id || m?.model_id || m?.name))
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (!models.length) return json({ error: '没读到模型列表' }, 502);
    return json({ models });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '连不上接口' }, 502);
  }
}
