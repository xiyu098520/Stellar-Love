'use client';

import type { ApiProfile } from './types';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function endpoint(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  if (!b) throw new Error('还没填 API 地址');
  if (/\/chat\/completions$/.test(b)) return b;
  return `${b}/chat/completions`;
}

export async function chat(
  settings: Pick<ApiProfile, 'baseUrl' | 'apiKey' | 'model' | 'temperature'>,
  messages: ChatMessage[],
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<string> {
  const res = await fetch(endpoint(settings.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature ?? 0.9,
      max_tokens: opts.maxTokens ?? 2000,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`请求失败 ${res.status}${t ? '：' + t.slice(0, 200) : ''}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('模型没有返回内容');
  }
  return content.trim();
}

/** 从可能带 ```json 包裹的文本里取出 JSON */
export function parseJSON<T>(raw: string): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s) as T;
}
