"""Discover public image/video skills and publish normalized candidates. No AI calls."""
import argparse
import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SHANGHAI = timezone(timedelta(hours=8))
REPO_NAME = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
PATTERNS = {
    'image': [r'image[ -]?(?:generation|editing|generator)', r'photo', r'poster', r'zine',
              r'illustrat', r'collage', r'risograph|cyanotype|embroid', r'comfyui',
              r'nano[ -]?banana', r'生图|绘画|海报|照片|图像生成|图片生成|插画'],
    'video': [r'video', r'remotion', r'ffmpeg', r'capcut|jianying', r'subtitle',
              r'vlog|montage', r'\bclips?\b|\bclipping\b', r'剪辑|视频|字幕|分镜|口播']
}


def now():
    return datetime.now(SHANGHAI).isoformat(timespec='seconds')


def read(path, fallback=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except FileNotFoundError:
        return copy.deepcopy(fallback)


def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(path)


def relevance(text, channel):
    return sum(bool(re.search(pattern, text, re.I)) for pattern in PATTERNS[channel])


class RequestLimit(RuntimeError):
    pass


class GitHub:
    def __init__(self, budget):
        self.budget, self.requests, self.last_search = budget, 0, 0
        self.token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')

    def get(self, endpoint, optional=False):
        if not endpoint.startswith('/') or endpoint.startswith('//'):
            raise ValueError('Expected a GitHub API path')
        if self.requests >= self.budget:
            raise RequestLimit('本次请求预算已用完，余项留到下次')
        if endpoint.startswith('/search/'):
            time.sleep(max(0, 2.1 - (time.monotonic() - self.last_search)))
            self.last_search = time.monotonic()
        self.requests += 1
        headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'Inspiration-Studio/2',
                   'X-GitHub-Api-Version': '2022-11-28'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        for attempt in range(3):
            try:
                req = urllib.request.Request('https://api.github.com' + endpoint, headers=headers)
                with urllib.request.urlopen(req, timeout=25) as response:
                    raw = response.read(6_000_001)
                if len(raw) > 6_000_000:
                    raise ValueError('GitHub response exceeds size limit')
                return json.loads(raw)
            except urllib.error.HTTPError as exc:
                if exc.code == 404 and optional:
                    return None
                if exc.code in (403, 429):
                    raise RequestLimit('GitHub 限流或访问受限，保留已有资料') from None
                if exc.code >= 500 and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError('GitHub HTTP ' + str(exc.code)) from None
            except (urllib.error.URLError, TimeoutError):
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError('GitHub 网络请求未完成') from None


def decode(doc):
    if not doc:
        return ''
    if doc.get('encoding') == 'base64':
        return base64.b64decode(doc.get('content', '')).decode('utf-8', errors='replace')
    return doc.get('content', '')


def frontmatter(text, field):
    if not text.lstrip().startswith('---'):
        return ''
    lines = text.splitlines()
    for index, line in enumerate(lines[1:], 1):
        if line.strip() == '---':
            break
        match = re.match(r'^' + re.escape(field) + r':\s*(.*)$', line)
        if not match:
            continue
        value = match[1].strip()
        if re.fullmatch(r'[>|][-+]?', value):
            parts = []
            for tail in lines[index + 1:]:
                if tail and not tail[0].isspace():
                    break
                if tail.strip():
                    parts.append(tail.strip())
            return ' '.join(parts)
        return value.strip('"\x27')
    return ''


def repo_links(text):
    names = re.findall(r'https://github\.com/([\w.-]+/[\w.-]+)', text)
    return list(dict.fromkeys(n.removesuffix('.git') for n in names if REPO_NAME.fullmatch(n)))


def sample_image(text, repo, branch):
    images = [a or b for a, b in re.findall(
        r'!\[[^\]]*\]\(([^\s)]+)[^)]*\)|<img[^>]+src=["\x27]([^"\x27]+)', text, re.I)]
    ranked = []
    for image in images:
        if re.search(r'shields|badge|star-history|logo|qrcode|wechat|alipay|sponsor|avatar|donat|/pay/', image, re.I):
            continue
        if image.startswith('//'):
            image = 'https:' + image
        elif not urllib.parse.urlsplit(image).scheme:
            image = urllib.parse.urljoin(f'https://raw.githubusercontent.com/{repo}/{branch}/', image)
        if urllib.parse.urlsplit(image).scheme != 'https':
            continue
        if not re.search(r'\.(png|jpe?g|webp|gif)(\?|$)|github.com/user-attachments/assets/', image, re.I):
            continue
        rank = 2 if re.search(r'after|result|output|example|showcase|gallery|demo', image, re.I) else 1
        ranked.append((rank, image))
    return max(ranked, key=lambda pair: pair[0])[1] if ranked else ''


def category(text, channel):
    groups = ([('口播与字幕', r'subtitle|talking|transcri|口播|字幕|whisper'),
               ('旅游与探店', r'vlog|travel|tour|旅游|探店'),
               ('产品与动效', r'remotion|product|motion|产品|动效'),
               ('短视频工作流', r'short|clip|n8n|短视频|切片')]
              if channel == 'video' else
              [('纸艺与印刷', r'zine|paper|riso|print|cyanotype|纸|蓝晒'),
               ('海报与插画', r'poster|illustrat|海报|插画'),
               ('材质与数字实验', r'embroider|material|texture|pixel|刺绣|材质|像素'),
               ('照片抽象', r'photo|abstract|照片|抽象')])
    return next((label for label, pattern in groups if re.search(pattern, text, re.I)),
                '视频创作' if channel == 'video' else '视觉创作')


def candidate_id(repo, channel):
    digest = hashlib.sha256(repo.lower().encode()).hexdigest()[:16]
    return ('discover-video-' if channel == 'video' else 'discover-') + digest


def inspect_repo(api, repo, channel):
    if not REPO_NAME.fullmatch(repo):
        return None
    meta = api.get('/repos/' + repo, optional=True)
    if not meta or meta.get('private') or meta.get('fork') or meta.get('archived'):
        return None
    repo = meta['full_name']
    branch = meta.get('default_branch', 'main')
    tree = api.get('/repos/' + repo + '/git/trees/' + urllib.parse.quote(branch, safe='') + '?recursive=1')
    paths = [node['path'] for node in tree.get('tree', []) if node.get('type') == 'blob'
             and node['path'].endswith('SKILL.md')
             and not re.search(r'(^|/)(node_modules|tests?|_templates|vendor)(/|$)', node['path'])]
    identity = repo + ' ' + (meta.get('description') or '')
    # Prefer the matching entry in multi-skill repos instead of the first SKILL.md.
    matching = sorted(paths, key=lambda path: (-relevance(path, channel), path != 'SKILL.md', len(path), path))
    doc = api.get('/repos/' + repo + '/readme', optional=True)
    readme = decode(doc)
    chosen = matching[0] if matching else ''
    skill = decode(api.get('/repos/' + repo + '/contents/' + urllib.parse.quote(chosen, safe='/'), optional=True)) if chosen else ''
    name = frontmatter(skill, 'name') or meta.get('name', repo.split('/')[-1])
    desc = frontmatter(skill, 'description') or meta.get('description') or ''
    evidence = identity + ' ' + chosen + ' ' + name + ' ' + desc
    if not relevance(evidence, channel):
        return None
    # A tool without a Skill must be clearly about this medium in its own metadata.
    if not chosen and not relevance(identity, channel):
        return None
    sample = sample_image(readme, repo, branch)
    label = category(evidence, channel)
    source = f'https://github.com/{repo}/blob/{branch}/' + urllib.parse.quote(chosen, safe='/') if chosen else f'https://github.com/{repo}#readme'
    return dict(id=candidate_id(repo, channel), media=channel, scope='discover', title=meta.get('name', name),
                name=name, repo=repo, url=meta.get('html_url', 'https://github.com/' + repo), source=source,
                kind='Skill 候选' if chosen else '工具/工作流候选', category=label, tags=[label],
                description=desc[:1600],
                prompt=(f'请先读取 {name} 的技能说明，确认输入与依赖，再按说明处理我的' +
                        ('视频素材，先给剪辑方案和分镜预览。' if channel == 'video' else '图片或创作主题，先给创作方向。'))
                       if chosen else '请先阅读项目文档，确认输入、依赖与使用范围，再帮我规划这个工作流。',
                rule='', needs='', image=sample, original_image=sample,
                image_kind='自动发现的公开样图', credit='原仓库 README 公开样图；尚待核对是否对应实际成品' if sample else '',
                license=(meta.get('license') or {}).get('spdx_id') or '未标注，需核对原文', license_url='',
                note='', verification='公开资料自动发现，尚未逐项实测', date=now(), status='待筛选',
                featured=False, stars=meta.get('stargazers_count', 0), skill_count=len(paths),
                last_checked=now(), source_updated=meta.get('pushed_at', ''), tree_truncated=tree.get('truncated', False),
                install=dict(repository=repo, ref=branch, path=chosen, name=name, entry_url=source,
                             checked_at=now()) if chosen else None)


def merge_record(previous, fresh, discovered_from):
    merged = {**fresh, 'discovered_from': discovered_from}
    if previous:
        for key in ('id', 'date', 'status', 'note'):
            if key in previous:
                merged[key] = previous[key]
        # Keep attributed preview evidence when a refresh cannot find another image.
        if not fresh.get('image') and previous.get('image'):
            for key in ('image', 'original_image', 'image_kind', 'credit'):
                merged[key] = previous.get(key, '')
    return merged


def update_counts(catalogue):
    records = catalogue['records']
    curated = [r for r in records if r['scope'] == 'curated']
    found = [r for r in records if r['scope'] == 'discover']
    catalogue['counts'] = dict(image=sum(r['media'] == 'image' for r in curated),
                              video=sum(r['media'] == 'video' for r in curated), discover=len(found),
                              discover_image=sum(r['media'] == 'image' for r in found),
                              discover_video=sum(r['media'] == 'video' for r in found))


def collect_channel(catalogue, state, config, channel, api):
    started = now()
    spec = config['channels'][channel]
    known = {r['repo'].lower() for r in catalogue['records'] if r['scope'] == 'curated' and r['media'] == channel}
    existing = {r['repo'].lower(): r for r in catalogue['records'] if r['scope'] == 'discover' and r['media'] == channel}
    pending = {entry['repo'].lower(): entry for entry in state.get('queue', [])
               if REPO_NAME.fullmatch(entry.get('repo', '')) and entry['repo'].lower() not in known}
    errors, sources_ok, inspected, new_count = [], 0, 0, 0
    checked = state.setdefault('examined', {})
    day = datetime.now(SHANGHAI).date().toordinal()
    queries = spec['queries']
    count = min(config.get('queries_per_run', 4), len(queries))
    selected = [queries[(day * count + index) % len(queries)] for index in range(count)]
    try:
        for index in spec.get('indexes', []):
            try:
                text = decode(api.get('/repos/' + index + '/readme'))
                sources_ok += 1
                for repo in repo_links(text):
                    if repo.lower() not in known:
                        pending.setdefault(repo.lower(), {'repo': repo, 'discovered_from': index})
            except RequestLimit:
                raise
            except Exception as exc:
                errors.append(index + ': ' + str(exc))
        for query in selected:
            try:
                args = urllib.parse.urlencode(dict(q=query + ' is:public fork:false archived:false', sort='updated', per_page=30))
                result = api.get('/search/repositories?' + args)
                sources_ok += 1
                for meta in result.get('items', []):
                    repo = meta['full_name']
                    if REPO_NAME.fullmatch(repo) and repo.lower() not in known:
                        pending.setdefault(repo.lower(), {'repo': repo, 'discovered_from': 'GitHub search: ' + query})
            except RequestLimit:
                raise
            except Exception as exc:
                errors.append('Search ' + query + ': ' + str(exc))
    except RequestLimit as exc:
        errors.append(str(exc))
    cutoff = (datetime.now(SHANGHAI) - timedelta(days=config.get('refresh_days', 7))).isoformat()
    # Search-result matches first, then index entries; unseen repos first within each group.
    queue = sorted(pending.values(), key=lambda entry: (
        entry['repo'].lower() in existing, entry['repo'].lower() in checked,
        not entry.get('discovered_from', '').startswith('GitHub search:'),
        -relevance(entry['repo'], channel)))
    deferred = []
    for pos, entry in enumerate(queue):
        key = entry['repo'].lower()
        if checked.get(key, '') > cutoff:
            continue
        if inspected >= config.get('max_inspections_per_channel', 16) or api.requests > api.budget - 5:
            deferred.append(entry)
            continue
        try:
            inspected += 1
            fresh = inspect_repo(api, entry['repo'], channel)
            checked[key] = now()
            if fresh:
                previous = existing.get(key)
                existing[key] = merge_record(previous, fresh, entry.get('discovered_from', ''))
                if not previous:
                    new_count += 1
        except RequestLimit as exc:
            errors.append(str(exc))
            deferred.extend(queue[pos:])
            break
        except Exception as exc:
            # Failed/empty repos get a cooldown rather than blocking every daily batch.
            checked[key] = now()
            errors.append(entry['repo'] + ': ' + str(exc))
    state['queue'] = deferred[:2000]
    state['examined'] = dict(sorted(checked.items(), key=lambda pair: pair[1], reverse=True)[:6000])
    catalogue['records'] = [r for r in catalogue['records'] if not (r['scope'] == 'discover' and r['media'] == channel)] + list(existing.values())
    result = dict(label=spec['label'], status='完成' if not errors else '部分完成，见记录',
                  started_at=started, finished_at=now(), requests=api.requests, inspected=inspected,
                  new_candidates=new_count, candidates=len(existing), queued=len(deferred), errors=errors[:20],
                  sources_checked=sources_ok, queries=selected, ai_calls=0)
    if not sources_ok:
        result['status'] = '采集失败，保留原资料'
    state['last_run'] = result
    return result


def run(catalogue_path, state_path, config):
    catalogue = read(catalogue_path)
    if not catalogue or not isinstance(catalogue.get('records'), list):
        raise ValueError('Missing normalized catalogue')
    state = read(state_path, {'schema_version': 1, 'channels': {}})
    started = now()
    channels = {}
    for channel in ('image', 'video'):
        channel_state = state.setdefault('channels', {}).setdefault(channel, {'queue': [], 'examined': {}})
        api = GitHub(config.get('request_budget_per_channel', 90))
        try:
            channels[channel] = collect_channel(catalogue, channel_state, config, channel, api)
        except Exception as exc:
            channels[channel] = dict(label=config['channels'][channel]['label'], status='采集失败，保留原资料',
                                     started_at=started, finished_at=now(), requests=api.requests,
                                     inspected=0, new_candidates=0, queued=len(channel_state.get('queue', [])),
                                     sources_checked=0, errors=[str(exc)], ai_calls=0)
    update_counts(catalogue)
    errors = [config['channels'][key]['label'] + ': ' + error
              for key, result in channels.items() for error in result.get('errors', [])]
    old_success = catalogue.get('status', {}).get('last_success_at', '')
    failed = any(not result.get('sources_checked') for result in channels.values())
    catalogue['status'] = dict(started_at=started, finished_at=now(), status='完成' if not errors else '部分完成，见记录',
                               schedule=config['schedule'], channels=channels, ai_calls=0,
                               requests=sum(result['requests'] for result in channels.values()),
                               inspected=sum(result['inspected'] for result in channels.values()),
                               new_candidates=sum(result['new_candidates'] for result in channels.values()),
                               candidates=catalogue['counts']['discover'], queued=sum(result['queued'] for result in channels.values()),
                               errors=errors[:30], last_success_at=old_success if failed else now(),
                               workflow_url=('https://github.com/' + os.environ['GITHUB_REPOSITORY'] + '/actions/runs/' +
                                             os.environ['GITHUB_RUN_ID']) if os.environ.get('GITHUB_RUN_ID') else '')
    if failed:
        catalogue['status']['status'] = '部分方向采集失败，保留原资料'
    catalogue['generated_at'] = now()
    write(catalogue_path, catalogue)
    write(state_path, state)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as stream:
            stream.write('## 每日创意收录\n\n|方向|新增|候选总数|检查项目|状态|\n|---|---:|---:|---:|---|\n')
            for key, result in channels.items():
                stream.write(f"|{result['label']}|{result['new_candidates']}|{catalogue['counts']['discover_' + key]}|{result['inspected']}|{result['status']}|\n")
            stream.write('\n每天北京时间 09:17 · GitHub 云端运行 · 0 次 AI 调用\n')
    print(json.dumps({'counts': catalogue['counts'], 'channels': channels}, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalogue', type=Path, default=ROOT / 'docs/data/catalogue.json')
    parser.add_argument('--state', type=Path, default=ROOT / 'collector/state.json')
    parser.add_argument('--config', type=Path, default=ROOT / 'collector/sources.json')
    args = parser.parse_args()
    sys.exit(run(args.catalogue, args.state, read(args.config)))
