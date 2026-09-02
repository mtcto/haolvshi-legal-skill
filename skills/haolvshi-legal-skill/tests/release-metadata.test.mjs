import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const skillDir = path.resolve(new URL('..', import.meta.url).pathname);
const repoDir = path.resolve(skillDir, '../..');

test('技能包发布元数据版本保持一致', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(skillDir, 'package.json'), 'utf8'));
  const skillHubMeta = JSON.parse(await fs.readFile(path.join(skillDir, '_skillhub_meta.json'), 'utf8'));
  const skillMarkdown = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
  const rootReadme = await fs.readFile(path.join(repoDir, 'README.md'), 'utf8');
  const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  assert.match(packageJson.version, /^\d+\.\d+$/);
  assert.equal(skillHubMeta.version, packageJson.version);
  assert.match(skillMarkdown, new RegExp(`version: "${escapedVersion}"`));
  assert.match(rootReadme, new RegExp('当前技能包版本为 `' + escapedVersion + '`'));
});
