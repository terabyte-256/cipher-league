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

Use the **Draft Pool** tab to browse before signing in. Filter by role, search by company/model/tool, and follow the reference URL for each candidate. The eighth-round bench selection also supports a position filter, search, and a paginated candidate list; undrafted candidates sort first.

**Existing v3 Supabase setup:** you do not need to drop or recreate tables. Run the *new* `supabase/seed.sql` in the Supabase SQL Editor to upsert the extra assets, then publish the updated `site/` folder and enable the importer. Existing candidate slugs are preserved; the seed does not delete old draft picks. **New v3.1 setup:** run `schema.sql` followed by `seed.sql` as usual.

**Provider integrity:** locally checked all 268 identifiers for unique slugs, provider keys, source URLs and category size. GitHub repository and Hugging Face model availability can still change. Run `GH_TOKEN=... python3 scripts/validate_catalog.py --online` on an internet-connected machine to check live repo/model IDs and report CISA vendor-alias history. We could not complete remote checks in the offline build environment. For DEF, verify the current stock symbols and display rights with your licensed provider. Archived or inactive assets can have zero scores; missing provider responses remain pending rather than fabricated.

**Rate limits:** The expanded importer processes the current week daily and also rechecks the previous week on Monday–Wednesday UTC. To force previous-week backfill later, set `CIPHER_BACKFILL_PREVIOUS=1` for an importer run. Authenticated GitHub search requires `GH_TOKEN`; without a token, GitHub scoring is skipped. The workflow's timeout is extended to 50 minutes for 268 assets. Market-feed quota/licensing restrictions still apply; adding choices does not automatically make scores available.

## Publish a true multiplayer league (recommended: GitHub Pages + Supabase)

A static hosting URL alone is **not** multiplayer. Complete these steps in this order:

1. Create a fresh [Supabase project](https://supabase.com/dashboard/projects). In **SQL Editor**, run `supabase/schema.sql`, then `supabase/seed.sql`. **For existing v2 databases:** this schema is for a *fresh install*. It is not an in-place migration; don't overwrite an existing live league.
2. In Supabase **Authentication → Providers**, enable email sign-in. Under **Authentication → URL Configuration**, set your deployed **Site URL** and add the public website URL to the **Redirect URLs** allowlist. Configure production email sending/SMTP and OTP limits as appropriate.
3. In `site/config.js`, set the Supabase **Project URL** and its **publishable/anon key**. Both are intended for client use. **NEVER paste your service role key into the website.**
4. Push the *full source package* to a new GitHub repository on branch `main`. In **Settings → Pages**, set **Build and deployment → Source: GitHub Actions**. The existing `.github/workflows/pages.yml` publishes the `site/` directory.
5. Under **Settings → Secrets and variables → Actions**, add:
   - `SUPABASE_URL`: same project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: server-only key, used by the daily import workflow.
   - `CIPHER_GITHUB_TOKEN`: recommended GitHub token for public repository search (if omitted, GitHub Actions' built-in token is used).
   - `TWELVEDATA_API_KEY`: optional **only when your Twelve Data contract permits public display of derived scores**. Otherwise stock results remain **pending** and weekly matchups cannot be finalized. See licensing notes below.
6. Under **Actions**, run **Publish Cipher League and import verified signals → Run workflow** manually once. Check logs for the provider success/failure counts, and confirm `asset_week_scores` contains records in Supabase. The workflow subsequently runs daily at **13:17 UTC** and on pushes. Scheduled Actions can be delayed or skipped; monitor runs.
7. Open the GitHub Pages URL, sign in by email, create a private league, and share its invite URL. At least two **different** accounts are needed. The commissioner starts the draft. Round sequence: **DFIR → SOCIAL → SOC → VULN → DEF → LANG → AI → any-category bench**, snake order every round.

Official docs: [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [GitHub Pages Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

### Stock-market data licensing

The Twelve Data code in `scripts/sync_events.py` is a **server-only adapter**; the public website contains no market-data key. Public distribution of stock-data-derived scores may require a **commercial display / derived-data license**, exchange permissions and attribution. Twelve Data's individual/free tiers are not a blanket license for public redistribution. Check your plan with the provider **before enabling `TWELVEDATA_API_KEY` in a publicly available game**. References: [Twelve Data commercial & personal usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage), [Twelve Data terms](https://twelvedata.com/terms). Weekly output stores and displays only a derived return percent and fantasy score, not the underlying raw prices, but this does not remove licensing obligations.

## Optional: publish the website immediately without configuring multiplayer

The `site/` folder can be dragged into [Netlify Drop](https://app.netlify.com/drop), or served by GitHub Pages. You will see the homepage, seven-position catalog, real-event display and rules, but **sign-in, draft, leagues, and live scoring won't work until the database and scheduled importer have been configured**. For Netlify, the provided `netlify.toml` sets `site/` as the publish directory; import jobs still require a separate scheduler such as GitHub Actions. The site also contains `/practice/`, the **legacy fictional single-player demo**; it is not the new category-based multiplayer game.

## Develop locally

```bash
cd site
python3 -m http.server 8080
# open http://localhost:8080
```

For local multiplayer testing, authorize `http://localhost:8080` in Supabase's Auth Redirect URL list and populate `site/config.js` with the **public** key only. To run an importer manually with appropriately scoped *server-side* environment variables:

```bash
SUPABASE_URL='https://YOUR-PROJECT.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='SECRET-KEEP-PRIVATE' \
GH_TOKEN='YOUR_GITHUB_ACCESS_TOKEN' \
python3 scripts/sync_events.py --source github
```

Valid sources: `all`, `cisa`, `github`, `social`, `ai`, `stock`. If provider auth/network fails, that score is **not** overwritten with fake data. The first AI snapshot is used as a baseline; unlike historical public feeds, **Hugging Face likes growth cannot be reconstructed retroactively without prior snapshots**. GDELT history is limited; request only recent weeks. A new deployment should ideally start collecting snapshots before the first scoring Monday.

## Security model

- RLS prevents authenticated users reading another league's members, picks or lineups. Public candidate and scoring feeds are read-only.
- RPCs use league row locks and validate ownership, commissioner permissions, draft turns, required positions, and unique picks **inside PostgreSQL transactions**.
- Browser clients cannot write scoring facts or retroactively edit past starting lineups. Only a trusted server-side service role imports observations and snapshots.
- League standings count **completed weeks with all seven scoring positions present for every roster**. Otherwise that week remains *data pending*.
- Supabase realtime change feeds synchronize league members, draft picks and lineups. A manual Refresh is also available.
- Invitation codes are convenience join secrets, **not** a substitute for identity or authorization.
- **Limitations:** no autopicks/draft timeouts, trading/waivers, realtime chat, auto playoffs, or fully licensed stock feed included. Reliability depends on external API access and scheduled job runs. External data may revise after collection.

## Project contents

```
site/                          Static website (publish this folder; browsable pool)
  index.html, multiplayer.js, styles.css, config.js
  data/assets.json, data/events.json
  practice/                    Legacy fictional single-player game
supabase/schema.sql            Multiplayer database, RLS and RPCs
supabase/seed.sql              Curated category-based draft pool
scripts/build_catalog.py      Rebuild JSON draft pool and SQL seed
scripts/validate_catalog.py    Offline checks; optional live ID preflight
scripts/sync_events.py        All seven external signal importers
.github/workflows/pages.yml    Scheduled ingest + Pages publish
tests/multiplayer-test.cjs      Offline rules/unit tests
tests/smoke-test.cjs            Legacy practice game engine test
```

## Run tests

```bash
node --check site/multiplayer.js
python3 scripts/validate_catalog.py
node tests/multiplayer-test.cjs
node tests/smoke-test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

Tests check catalog integrity, business logic and the static frontend. There is an optional `python3 test_browser.py` Chromium smoke test; it needs a local browser allowed to navigate to localhost. **Production Supabase/OTP, market licensing, upstream asset identifiers, and all third-party provider responses still require live verification.** After setup, test simultaneously with at least two email accounts before announcing a public league.

## License

Game source: MIT (`LICENSE`). CISA, GitHub, GDELT, Hugging Face and commercial financial providers retain control of their own data and API usage terms. This game is not endorsed by any of them.
