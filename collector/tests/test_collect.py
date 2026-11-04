import base64
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collect import (candidate_id, collect_channel, frontmatter, inspect_repo,
                     merge_record, sample_image, update_counts)


def encoded(text):
    return {'encoding': 'base64', 'content': base64.b64encode(text.encode()).decode()}


class RepoAPI:
    def get(self, endpoint, optional=False):
        if endpoint == '/repos/example/studio':
            return {'full_name': 'example/studio', 'name': 'studio', 'description': 'Creative tools',
                    'default_branch': 'main', 'html_url': 'https://github.com/example/studio'}
        if '/git/trees/' in endpoint:
            return {'tree': [{'type': 'blob', 'path': path} for path in [
                'SKILL.md', 'skills/image-poster/SKILL.md', 'skills/video-editor/SKILL.md']]}
        if endpoint.endswith('/readme'):
            return encoded('![Demo](examples/result.jpg)')
        if 'video-editor' in endpoint:
            return encoded('---\nname: video-editor\ndescription: Edit video with FFmpeg.\n---')
        if 'image-poster' in endpoint:
            return encoded('---\nname: image-poster\ndescription: Generate a photo poster.\n---')
        raise AssertionError('Wrong Skill selected: ' + endpoint)


class FailedAPI:
    budget, requests = 90, 0

    def get(self, endpoint, optional=False):
        self.requests += 1
        raise RuntimeError('GitHub network unavailable')


class CollectorTests(unittest.TestCase):
    def test_selects_matching_skill_in_shared_repository(self):
        video = inspect_repo(RepoAPI(), 'example/studio', 'video')
        image = inspect_repo(RepoAPI(), 'example/studio', 'image')
        self.assertIn('video-editor', video['source'])
        self.assertIn('image-poster', image['source'])
        self.assertEqual(video['media'], 'video')
        self.assertNotEqual(video['id'], image['id'])

    def test_refresh_preserves_existing_identity_review_and_preview(self):
        old = {'id': 'legacy-id', 'date': '2026-10-28', 'status': '值得研究', 'note': 'Keep this',
               'image': 'https://example.org/result.jpg', 'credit': 'Original author'}
        fresh = {'id': 'new-id', 'date': '2026-11-05', 'status': '待筛选', 'note': '', 'image': ''}
        merged = merge_record(old, fresh, 'GitHub search')
        for field in ['id', 'date', 'status', 'note', 'image', 'credit']:
            self.assertEqual(merged[field], old[field])

    def test_network_failure_does_not_drop_any_existing_direction(self):
        catalogue = {'records': [
            {'id': 'image-1', 'media': 'image', 'scope': 'curated', 'repo': 'curated/photo'},
            {'id': 'video-1', 'media': 'video', 'scope': 'curated', 'repo': 'curated/video'},
            {'id': 'old-image', 'media': 'image', 'scope': 'discover', 'repo': 'found/photo'},
            {'id': 'old-video', 'media': 'video', 'scope': 'discover', 'repo': 'found/video'}]}
        expected = {r['id'] for r in catalogue['records']}
        config = {'channels': {'image': {'label': '生图', 'queries': ['photo skill'], 'indexes': []}}}
        result = collect_channel(catalogue, {}, config, 'image', FailedAPI())
        self.assertEqual(result['sources_checked'], 0)
        self.assertEqual({r['id'] for r in catalogue['records']}, expected)
        update_counts(catalogue)
        self.assertEqual(catalogue['counts']['discover_image'], 1)
        self.assertEqual(catalogue['counts']['discover_video'], 1)

    def test_repeated_discovery_merges_by_repository(self):
        catalogue = {'records': []}
        config = {'channels': {'video': {'label': '视频', 'queries': ['video skill'], 'indexes': []}},
                  'max_inspections_per_channel': 1}
        class SearchAPI(RepoAPI):
            budget, requests = 90, 0
            def get(self, endpoint, optional=False):
                self.requests += 1
                if endpoint.startswith('/search/'):
                    return {'items': [{'full_name': 'example/studio'}, {'full_name': 'example/studio'}]}
                return super().get(endpoint, optional)
        first = collect_channel(catalogue, {}, config, 'video', SearchAPI())
        second = collect_channel(catalogue, {}, config, 'video', SearchAPI())
        self.assertEqual(first['new_candidates'], 1)
        self.assertEqual(second['new_candidates'], 0)
        self.assertEqual(len(catalogue['records']), 1)

    def test_badges_are_not_published_as_effect_images(self):
        text = '![CI](https://img.shields.io/badge/test.png) ![Logo](logo.png) ![Result](examples/after.webp)'
        self.assertEqual(sample_image(text, 'owner/repo', 'main'),
                         'https://raw.githubusercontent.com/owner/repo/main/examples/after.webp')
        self.assertEqual(sample_image('![x](javascript:alert.png)', 'owner/repo', 'main'), '')

    def test_folded_frontmatter_and_stable_case_insensitive_ids(self):
        self.assertEqual(frontmatter('---\ndescription: >-\n  Edit videos.\n  Preserve audio.\n---', 'description'),
                         'Edit videos. Preserve audio.')
        self.assertEqual(candidate_id('Owner/Repo', 'image'), candidate_id('owner/repo', 'image'))


if __name__ == '__main__':
    unittest.main()
