#!/usr/bin/env python3
"""Validate the expanded candidate catalog; --online checks remote API identifiers.

Requires internet; optionally set GH_TOKEN to increase GitHub API rate limit.
Checks GitHub repos and Hugging Face model IDs, and reports which CISA vendor
aliases have appeared in the official KEV catalog historically. Stock tickers
require separate validation with a licensed market-data account.
"""
from __future__ import annotations
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ASSETS = json.loads((ROOT / 'site/data/assets.json').read_text())
POSITIONS = ('DFIR', 'SOCIAL', 'SOC', 'VULN', 'DEF', 'LANG', 'AI')


def fetch(url, headers=None):
    request = Request(url, headers={
        'User-Agent': 'CipherLeague/3.1 catalog preflight',
        'Accept': 'application/json', **(headers or {})})
    with urlopen(request, timeout=25) as response:
        return json.load(response)


def validate_offline():
    counts = Counter(a['position'] for a in ASSETS)
    assert set(counts) == set(POSITIONS)
    assert all(counts[p] >= 32 for p in POSITIONS), counts
    assert len(set(a['slug'] for a in ASSETS)) == len(ASSETS)
    assert len(set((a['provider'], a['key']) for a in ASSETS)) == len(ASSETS)
    assert all(re.fullmatch(r'[a-z0-9-]{2,40}', a['slug']) for a in ASSETS)
    assert all(a['source_url'].startswith('https://') for a in ASSETS)
    assert all(a['key'] and a['name'] for a in ASSETS)
    aliases = [alias.casefold() for a in ASSETS if a['position'] == 'VULN' for alias in a['aliases']]
    assert len(aliases) == len(set(aliases))
    print('OFFLINE PASS:', len(ASSETS), 'draftable assets')
    print('  ' + ', '.join(f'{p}={counts[p]}' for p in POSITIONS))


def validate_online():
    errors = []
    checked = 0
    header = {'Authorization':'Bearer ' + os.environ['GH_TOKEN']} if os.getenv('GH_TOKEN') else {}
    repo_assets = [a for a in ASSETS if a['provider'] == 'github_repo']
    ai_assets = [a for a in ASSETS if a['provider'] == 'huggingface']
    for a in repo_assets + ai_assets:
        url = ('https://api.github.com/repos/' if a['provider'] == 'github_repo'
               else 'https://huggingface.co/api/models/') + quote(a['key'], safe='/')
        try:
            data = fetch(url, header if a['provider'] == 'github_repo' else {})
            if a['provider'] == 'github_repo' and not data.get('full_name'):
                raise ValueError('No repository full_name')
            if a['provider'] == 'huggingface' and not isinstance(data.get('likes'), int):
                raise ValueError('Missing model likes count')
            checked += 1
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            errors.append(f'{a["slug"]}: {exc}')
        time.sleep(.8)  # Conservative additional delay for public APIs.
    try:
        kev = fetch('https://raw.githubusercontent.com/CISAgov/kev-data/develop/known_exploited_vulnerabilities.json')
        vendors = Counter(v['vendorProject'].casefold().strip() for v in kev['vulnerabilities'])
        missing = [a['name'] for a in ASSETS if a['provider'] == 'cisa'
                   and not any(vendors[alias.casefold()] for alias in a['aliases'])]
        print('CISA alias history:', len([a for a in ASSETS if a['provider'] == 'cisa'])-len(missing),
              'matched; historical zero-match:', ', '.join(missing) if missing else 'none')
    except (HTTPError, URLError, ValueError, KeyError) as exc:
        errors.append('CISA alias preflight: ' + str(exc))
    print('REMOTE PREFLIGHT:', checked, 'repository/model identifiers verified')
    print('Stock symbols are NOT validated here; use your licensed market-data provider.')
    for issue in errors:
        print('UNVERIFIED:', issue)
    return bool(errors)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--online', action='store_true', help='Contact GitHub/Hugging Face/CISA APIs')
    args = ap.parse_args()
    validate_offline()
    if args.online and validate_online():
        raise SystemExit(1)
