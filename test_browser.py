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
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        page.goto(base, wait_until='domcontentloaded')
        page.wait_for_function("document.body.innerText.includes('268')")
        assert page.locator('h1').first.inner_text().startswith('Draft the cyber world')
        page.locator('[data-page="pool"]').first.click()
        page.locator('#pool-position').wait_for()
        assert page.locator('.asset-card').count() == 48
        assert page.locator('[data-action="more-pool"]').count() == 1
        page.locator('#pool-position').select_option('AI')
        assert page.locator('.asset-card').count() == 40
        page.locator('#pool-search').fill('DeepSeek')
        assert page.locator('.asset-card').count() >= 3
        page.locator('#pool-search').fill('')
        page.locator('#pool-position').select_option('ALL')
        page.locator('[data-action="more-pool"]').click()
        assert page.locator('.asset-card').count() == 96
        assert page.locator('.asset-card a').count() >= 90
        page.screenshot(path=str(SITE.parent / 'catalog-preview.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function("document.body.innerText.includes('268')")
        page.locator('[data-action="menu"]').click()
        page.locator('[data-page="pool"]').first.click()
        page.screenshot(path=str(SITE.parent / 'catalog-mobile-preview.png'), full_page=True)
        assert not errors, errors
        print('BROWSER PASS: homepage; guest catalog; position filter; search; pagination; mobile navigation; 0 JS errors')
        browser.close()
finally:
    server.shutdown()
    server.server_close()
