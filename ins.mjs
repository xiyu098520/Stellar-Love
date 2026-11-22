import fs from 'fs';
const j = JSON.parse(fs.readFileSync('d:/Stellasei-New/星恋-银冠篇.json', 'utf8'));
const cut = (s, n = 80) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s);
console.log('TOP', Object.keys(j));
for (const k of Object.keys(j)) {
  const v = j[k];
  if (typeof v === 'string') console.log(`W.${k}(${v.length})`, cut(v, 60));
}
console.log('placeList', (j.placeList || []).map(p => `${p.title}|${p.mode || ''}|${cut(p.content, 40)}`));
console.log('events', (j.events || []).map(p => `${p.title}|${p.mode || ''}|${cut(p.content, 40)}`));
console.log('CHARACTERS');
for (const c of j.characters || []) {
  console.log('---', c.id, c.name, 'role=', c.role, 'identity=', c.identity, 'voice=', c.voiceId, 'avatar=', cut(c.avatar, 40));
  console.log('  brief:', c.brief);
  console.log('  speech:', cut(c.speech, 40));
  console.log('  sample:', cut(c.sample, 60));
  console.log('  note:', cut(c.note, 300));
  console.log('  fields:', (c.fields || []).map(f => `${f.k}=${cut(f.v, 50)}`));
  console.log('  attrs:', c.attrs);
}
console.log('self', j.self);
console.log('items', (j.items || []).map(i => i.name));
console.log('specials', (j.specials || []).length);
console.log('notes', cut(j.notes, 200));
console.log('currency', j.currency);
console.log('initialMoney', j.initialMoney);
