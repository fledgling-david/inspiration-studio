const test = require('node:test');
const assert = require('node:assert/strict');
const install = require('../docs/install.js');

const skill = { kind: '现成 Skill', name: 'photo-example', title: '照片变海报', repo: 'owner/repo',
  url: 'https://github.com/owner/repo', source: 'https://github.com/owner/repo/blob/main/skills/photo-example/SKILL.md',
  prompt: '保留主体，制作一张海报。' };

test('targets the exact nested skill folder and agent', () => {
  assert.equal(install.info(skill).state, 'located');
  assert.equal(install.info(skill).path, 'skills/photo-example/SKILL.md');
  assert.equal(install.command(skill, 'codex'),
    'npx skills add https://github.com/owner/repo/tree/main/skills/photo-example --skill photo-example --agent codex');
});
test('Codex and Cursor links preserve the full request and use documented routes', () => {
  const codex = new URL(install.link(skill, 'codex'));
  assert.equal(codex.protocol, 'codex:');
  assert.equal(codex.hostname, 'new');
  assert.equal(codex.searchParams.get('prompt'), install.request(skill, 'codex'));
  const cursor = new URL(install.link(skill, 'cursor'));
  assert.equal(cursor.origin, 'https://cursor.com');
  assert.equal(cursor.pathname, '/link/prompt');
  assert.equal(cursor.searchParams.get('text'), install.request(skill, 'cursor'));
});
test('README-only records ask the agent to locate a skill rather than inventing a path', () => {
  const entry = { ...skill, source: 'https://github.com/owner/repo/blob/main/README.md', name: 'Display Name' };
  assert.equal(install.info(entry).state, 'locate-first');
  assert.equal(install.command(entry), 'npx skills add https://github.com/owner/repo --agent codex');
  assert.match(install.request(entry), /定位/);
});
test('prompt examples and workflows never receive a Skill installation command', () => {
  for (const kind of ['提示词案例，待加工', '提示词库候选', '工具/工作流', '商业平台工作流']) {
    const entry = { ...skill, kind };
    assert.equal(install.command(entry), '');
    assert.doesNotMatch(install.request(entry), /\$skill-installer/);
  }
});
test('rejects a mismatched repository, traversal and executable URL schemes', () => {
  assert.equal(install.info({ ...skill, source: 'https://github.com/other/repo/blob/main/SKILL.md' }).state, 'locate-first');
  assert.equal(install.info({ ...skill, source: 'javascript:alert(1)' }).folderURL, '');
  const entry = { ...skill, install: { repository: 'owner/repo', ref: 'main', path: '../SKILL.md' } };
  assert.equal(install.info(entry).state, 'locate-first');
  assert.equal(install.command({ kind: 'Skill 候选', url: 'javascript:alert(1)', repo: 'x/y;echo BAD' }), '');
});
test('encoded URLs remain bounded with long Chinese prompts and unusual ref/path names', () => {
  const entry = { ...skill, prompt: '照片与剪辑'.repeat(5000), install: {
    repository: 'owner/repo', ref: 'feature/creative', path: "skills/a b'c/SKILL.md", name: 'photo-example' } };
  assert.ok(install.link(entry, 'cursor').length < 10000);
  const command = install.command(entry, 'claude-code');
  assert.ok(command.includes('feature%2Fcreative'));
  assert.ok(command.includes('a%20b%27c'));
  assert.ok(!command.includes("'"));
});
test('the whole catalogue produces valid handoffs without including local notes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/data/catalogue.json'), 'utf8'));
  for (const record of data.records) {
    assert.ok(install.link(record, 'codex').startsWith('codex://new?prompt='), record.id);
    assert.ok(install.link(record, 'cursor').length < 10000, record.id);
    assert.equal(install.link(record, 'claude-code'), '', record.id);
    if (record.kind.includes('提示词')) assert.equal(install.command(record), '', record.id);
  }
});
