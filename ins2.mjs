import fs from 'fs';
const j = JSON.parse(fs.readFileSync('d:/Stellasei-New/星恋-银冠篇.json', 'utf8'));
console.log('=== relations\n' + j.relations);
console.log('=== era\n' + j.era);
console.log('=== rules\n' + j.rules);
console.log('=== banned\n' + j.banned);
console.log('=== style\n' + j.style);
console.log('=== outline\n' + j.outline);
console.log('=== opening\n' + j.opening);
console.log('=== self\n' + JSON.stringify(j.self, null, 2));
console.log('=== items\n' + JSON.stringify(j.items, null, 2));
for (const c of j.characters) {
  if (c.name === '波波' || c.name.includes('林') || c.name === '老鸦') {
    console.log('=== CHAR ' + c.name + '\n' + JSON.stringify(c, null, 2));
  }
}
const ev = (j.events || []).find(e => e.title === '情事');
console.log('=== 情事\n' + JSON.stringify(ev, null, 2));
