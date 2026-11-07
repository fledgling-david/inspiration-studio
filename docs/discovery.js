(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudioDiscovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const aliases = [
    ['旅行', '旅游', 'travel'], ['海报', 'poster', 'posters'],
    ['字幕', 'subtitle', 'subtitles', 'caption', 'captions'],
    ['卡点', 'beat sync', 'beat synced'], ['拼贴', 'collage'],
    ['刺绣', 'embroidery', 'embroidered'], ['半调', 'halftone'],
    ['口播', 'talking head']
  ];
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const expand = term => aliases.find(group => group.includes(term)) || [term];

  function score(record, query, notes = '') {
    const q = normalize(query);
    if (!q) return 0;
    const exactAlias = aliases.find(group => group.includes(q));
    const terms = exactAlias ? [exactAlias] : q.split(' ').map(expand);
    const fields = [
      [record.title, 60], [record.name, 50], [(record.tags || []).join(' ') + ' ' + (record.category || ''), 35],
      [record.repo, 25], [record.description, 15], [record.prompt, 8], [record.rule, 8], [notes, 5]
    ].map(([value, weight]) => [normalize(value), weight]);
    let total = 0;
    for (const alternatives of terms) {
      let best = 0;
      for (const [value, weight] of fields) {
        if (alternatives.some(term => value.includes(term))) best = Math.max(best, weight);
      }
      if (!best) return 0;
      total += best;
    }
    return total + (normalize(record.title) === q || normalize(record.name) === q ? 100 : 0);
  }

  function scopeRecords(records, options) {
    const { view = 'all', query = '', scope = 'global', media = '', favorites = [], history = [], workflow = [] } = options;
    if (query.trim() && scope === 'global') return [...records];
    if (view === 'favorites') return records.filter(r => favorites.includes(r.id));
    if (view === 'history' || view === 'workflow') {
      const ids = view === 'history' ? history.map(h => h.id) : workflow;
      return ids.map(id => records.find(r => r.id === id)).filter(Boolean);
    }
    return records.filter(r => view === 'discover'
      ? r.scope === 'discover' && (!media || r.media === media)
      : view === 'all' || r.media === view);
  }

  function hash(view, values = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== '' && value !== null && value !== undefined && value !== false) params.set(key, String(value));
    }
    return '#' + view + (params.size ? '?' + params : '');
  }

  function shareURL(record, base) {
    if (!record || record.scope === 'personal' || String(record.id).startsWith('custom-')) return '';
    const url = new URL(base);
    url.search = '';
    url.hash = hash('all', { item: record.id }).slice(1);
    return url.href;
  }

  function previewLabel(record) {
    if (!record.image) return '暂无样图';
    if (/示意/.test((record.image_kind || '') + ' ' + (record.credit || ''))) return '流程示意 · 非实际成品';
    return record.image_kind || '来源样图';
  }

  return { score, scopeRecords, hash, shareURL, previewLabel };
});
