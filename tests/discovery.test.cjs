const test = require('node:test');
const assert = require('node:assert/strict');
const discovery = require('../docs/discovery.js');
const rows = [
  { id: 'image-1', scope: 'curated', media: 'image', title: '旅行海报', name: 'travel-poster', tags: ['旅游'] },
  { id: 'found-1', scope: 'discover', media: 'video', title: 'Subtitle Studio', description: 'Automatic captions' },
  { id: 'custom-1', scope: 'personal', media: 'image', title: '我的照片' }
];

test('all-resource browsing includes candidates and personal saves while scoped search respects the column', () => {
  assert.deepEqual(discovery.scopeRecords(rows, { view: 'all' }).map(r => r.id), ['image-1', 'found-1', 'custom-1']);
  assert.deepEqual(discovery.scopeRecords(rows, { view: 'all', query: '字幕' }).filter(r => discovery.score(r, '字幕')).map(r => r.id), ['found-1']);
  assert.deepEqual(discovery.scopeRecords(rows, { view: 'all', query: '照片' }).filter(r => discovery.score(r, '照片')).map(r => r.id), ['custom-1']);
});
test('current-column search preserves collection membership and workflow order', () => {
  assert.deepEqual(discovery.scopeRecords(rows, { view: 'image', query: '字幕', scope: 'current' }).filter(r => discovery.score(r, '字幕')), []);
  assert.deepEqual(discovery.scopeRecords(rows, { view: 'favorites', query: '旅行', scope: 'current', favorites: ['custom-1'] }).map(r => r.id), ['custom-1']);
  assert.deepEqual(discovery.scopeRecords(rows, { view: 'workflow', workflow: ['custom-1', 'image-1'] }).map(r => r.id), ['custom-1', 'image-1']);
});
test('common bilingual queries match and title matches rank ahead of long descriptions', () => {
  assert.ok(discovery.score(rows[0], '旅行 poster') > 0);
  assert.ok(discovery.score({ title: 'Beat-Synced Edit' }, '卡点') > 0);
  assert.ok(discovery.score({ title: '旅行' }, '旅行') > discovery.score({ description: '旅行' }, '旅行'));
  assert.equal(discovery.score(rows[0], '旅行 字幕'), 0);
});
test('share links open only the public case and omit the visitor search context', () => {
  const url = discovery.shareURL(rows[0], 'https://example.com/studio/?campaign=private#favorites?q=my-notes');
  assert.equal(url, 'https://example.com/studio/#all?item=image-1');
  assert.equal(discovery.shareURL(rows[2], 'https://example.com'), '');
  assert.equal(discovery.shareURL({ id: 'custom-2', scope: 'curated' }, 'https://example.com'), '');
});
test('filter state round trips without treating special characters as new parameters', () => {
  const hash = discovery.hash('discover', { q: '纸 & ink?', category: '照片/抽象', image: true, empty: '', item: 'a#b' });
  const params = new URLSearchParams(hash.split('?')[1]);
  assert.equal(params.get('q'), '纸 & ink?');
  assert.equal(params.get('category'), '照片/抽象');
  assert.equal(params.get('item'), 'a#b');
  assert.equal(params.has('empty'), false);
});
test('a synthetic layout preview is never labeled as an actual finished result', () => {
  assert.equal(discovery.previewLabel({ image: 'demo.jpg', image_kind: '作者公开示例', credit: '合成场景版式示意' }), '流程示意 · 非实际成品');
  assert.equal(discovery.previewLabel({ image: '' }), '暂无样图');
});
