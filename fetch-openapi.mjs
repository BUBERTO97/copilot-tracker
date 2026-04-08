import fs from 'fs';
async function test() {
  const res = await fetch('https://api.github.com/openapi/2022-11-28');
  const text = await res.text();
  fs.writeFileSync('openapi.json', text);
}
test();
