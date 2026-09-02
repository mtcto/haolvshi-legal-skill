import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, rootUrl), 'utf8');
}

test('安装域名与在线应用域名保持分离', async () => {
  const [skill, install, config] = await Promise.all([
    read('SKILL.md'),
    read('INSTALL.md'),
    read('scripts/config.mjs')
  ]);

  assert.match(skill, /homepage: https:\/\/skills\.ai\.lvpin100\.com/);
  assert.match(install, /https:\/\/skills\.ai\.lvpin100\.com\/skills\/haolvshi-legal-skill\//);
  assert.doesNotMatch(install, /https:\/\/skill\.ai\.lvpin100\.com/);
  assert.match(config, /siteBase: 'https:\/\/skill\.ai\.lvpin100\.com'/);
});
