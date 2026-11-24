#!/usr/bin/env python3
"""End-to-end smoke test of the publishable v3.1 frontend (no credentials needed)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parent / 'site'
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(SITE)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        page.goto(base, wait_until='domcontentloaded')
        page.wait_for_selector('.key li')
        assert page.locator('h1').inner_text() == 'A fantasy league for cybersecurity'
        page.locator('#navigation [data-page="explore"]').click()
        page.wait_for_selector('li.player')
        assert page.locator('li.player').count() == 48
        page.locator('[data-pos="AI"]').click()
        assert page.locator('li.player').count() == 40
        page.locator('#pool-search').press_sequentially('DeepSeek')
        assert page.locator('li.player').count() >= 3
        page.locator('#pool-search').fill('')
        page.locator('[data-pos="ALL"]').click()
        page.locator('[data-action="more-pool"]').click()
        assert page.locator('li.player').count() == 96
        page.set_viewport_size({'width': 390, 'height': 844})
        for tab in ('players', 'rules', 'sources'):
            page.goto(base + '#explore/' + tab)
            assert page.evaluate('document.documentElement.scrollWidth') <= 390, tab
        assert not errors, errors
        print('BROWSER PASS: intro; guest catalog; filter; search; pagination; phone width; 0 JS errors')
        browser.close()
finally:
    server.shutdown()
    server.server_close()
