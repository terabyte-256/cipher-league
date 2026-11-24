# Cipher League v3.1 — 268 real-world draft assets, seven positions, multiplayer

Cipher League is a **deployable browser game**, not a hosted service. v3.1 expands the pool from 83 to **268 unique sourced assets** and adds a public, searchable scouting catalog with position filters and pagination. Managers create private leagues, invite friends, make atomic eight-round snake-draft picks, and compete for seven weekly matchups. **Every lineup starts one asset in each of seven different positions**, plus an eighth bench asset that can replace a starter *only in the same position*.

| Position | What you draft | Real-world scoring input | Weekly formula |
|---|---|---|---|
| **DFIR** · Forensics | Public forensics tool/project | GitHub merged PRs and releases | 3 per merged PR + 8 per release, cap 30 |
| **SOCIAL** · Social Engineering | Phishing / impersonation topic | GDELT English-language news coverage | round(2 × log2(1 + matching articles)), cap 30 |
| **SOC** · Detection | SOC/detection open-source project | GitHub merged PRs and releases | 3 per merged PR + 8 per release, cap 30 |
| **VULN** · Vulnerabilities | Technology vendor tracked in CISA KEV | Official CISA Known Exploited Vulnerabilities catalog | 12 per new KEV entry, +6 if CISA says ransomware use is known |
| **DEF** · Defense (tech stock) | Major listed tech company | Licensed Twelve Data EOD stock prices (provider adapter) | round(5 + 3 × weekly % return), clamp to −20…35 |
| **LANG** · Programming Language | Popular language | GitHub new public non-fork repos by primary language | round(2 × log2(1 + repo count)), cap 30 |
| **AI** · AI Model | Public Hugging Face model repo | Week-on-week model *likes* increase, using daily snapshots | round(like growth / 2), cap 30 |

**Important meaning of real-world data:** Scores are measurable public indicators, **not** a count of confirmed hacking incidents or proof of good/bad vendor security. GDELT reports **news mentions, not verified attacks**; GitHub project activity and Hugging Face popularity are proxies for interest/development, not security effectiveness. GitHub Search counts may be approximate. This is a forecasting/strategy game.

## Draft pool expanded for eight-person leagues

| Position | Number of candidates | Example assets |
|---|---:|---|
| DFIR (Forensics) | 33 | Volatility 3, Velociraptor, Autopsy, Plaso, GRR, capa |
| SOCIAL (Social Engineering) | 36 | Phishing, spear phishing, SIM swapping, OAuth phishing, deepfake scams |
| SOC (Detection) | 34 | Sigma, Wazuh, Suricata, Zeek, Snort 3, Falco |
| VULN (CISA KEV vendors) | 40 | Microsoft, Cisco, Fortinet, Palo Alto Networks, Veeam |
| DEF (Tech Stocks) | 45 | Apple, NVIDIA, CrowdStrike, Microsoft, SentinelOne |
| LANG (Programming) | 40 | Python, Rust, Go, TypeScript, C++, Zig, Haskell |
| AI (Models) | 40 | DeepSeek R1, Qwen, Llama, Gemma, Phi, FLUX |
| **TOTAL** | **268** | |

An eight-team league drafts 64 unique assets in eight rounds, leaving **204 undrafted**. Even after all eight managers draft their required starting positions, at least **25 choices remain in each category** before optional bench selections. There are still plenty of choices for future trading/waiver features (not yet implemented).

The app has four sections: **Play** (what to do next: draft or lineup), **Scores** (weekly matches and standings), **Explore** (players, rules and score sources, open to guests) and **League** (create, join, invite). The draft is drawn as a route that reverses each round; every position keeps one letter and colour. Product and design notes are in `PRODUCT.md` and `DESIGN.md`.

**Existing v3 Supabase setup:** you do not need to drop or recreate tables. Run the *new* `supabase/seed.sql` in the Supabase SQL Editor to upsert the extra assets, then publish the updated `site/` folder and enable the importer. Existing candidate slugs are preserved; the seed does not delete old draft picks. **New v3.1 setup:** run `schema.sql` followed by `seed.sql` as usual.

**Provider integrity:** locally checked all 268 identifiers for unique slugs, provider keys, source URLs and category size. GitHub repository and Hugging Face model availability can still change. Run `GH_TOKEN=... python3 scripts/validate_catalog.py --online` on an internet-connected machine to check live repo/model IDs and report CISA vendor-alias history. We could not complete remote checks in the offline build environment. For DEF, verify the current stock symbols and display rights with your licensed provider. Archived or inactive assets can have zero scores; missing provider responses remain pending rather than fabricated.

**Rate limits:** The expanded importer processes the current week daily and also rechecks the previous week on Monday–Wednesday UTC. To force previous-week backfill later, set `CIPHER_BACKFILL_PREVIOUS=1` for an importer run. Authenticated GitHub search requires `GH_TOKEN`; without a token, GitHub scoring is skipped. The workflow's timeout is extended to 50 minutes for 268 assets. Market-feed quota/licensing restrictions still apply; adding choices does not automatically make scores available.

**Social engineering scores:** GDELT throttles shared runners, so `.github/workflows/social.yml` runs every 3 hours and fetches only the asset-weeks that are missing or stale (current and previous week). Rows not fetched yet stay pending.

### Stock-market data licensing

The Twelve Data code in `scripts/sync_events.py` is a **server-only adapter**; the public website contains no market-data key. Public distribution of stock-data-derived scores may require a **commercial display / derived-data license**, exchange permissions and attribution. Twelve Data's individual/free tiers are not a blanket license for public redistribution. Check your plan with the provider **before enabling `TWELVEDATA_API_KEY` in a publicly available game**. References: [Twelve Data commercial & personal usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage), [Twelve Data terms](https://twelvedata.com/terms). Weekly output stores and displays only a derived return percent and fantasy score, not the underlying raw prices, but this does not remove licensing obligations.

## Project contents

```
site/                          Static website (publish this folder; browsable pool)
  index.html, multiplayer.js, styles.css, config.js
  fonts/                      Overpass (SIL Open Font License)
  data/assets.json, data/events.json
supabase/schema.sql            Multiplayer database, RLS and RPCs
supabase/seed.sql              Curated category-based draft pool
scripts/build_catalog.py      Rebuild JSON draft pool and SQL seed
scripts/validate_catalog.py    Offline checks; optional live ID preflight
scripts/sync_events.py        All seven external signal importers
.github/workflows/pages.yml    Scheduled ingest + Pages publish
tests/multiplayer-test.cjs      Offline rules/unit tests
```

## Run tests

```bash
node --check site/multiplayer.js
python3 scripts/validate_catalog.py
node tests/multiplayer-test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

Tests check catalog integrity, business logic and the static frontend. There is an optional `python3 test_browser.py` Chromium smoke test; it needs Playwright with its Chromium installed (`pip install playwright && playwright install chromium`). **Production Supabase (enable **Authentication → Providers → Anonymous sign-ins**; the game uses no email, only league invite codes), market licensing, upstream asset identifiers, and all third-party provider responses still require live verification.** After setup, test simultaneously in at least two separate browsers (each gets its own anonymous player) before announcing a public league.

## License

Game source: MIT (`LICENSE`). CISA, GitHub, GDELT, Hugging Face and commercial financial providers retain control of their own data and API usage terms. This game is not endorsed by any of them.
