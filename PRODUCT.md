# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students and members of a cyber club. They are learning the field, play in a private league of 2 to 8 people they know, and check in around a weekly cycle, often on a phone. Screens must explain what each position is and where a score came from in plain words.

## Product Purpose

A fantasy league for cybersecurity. Players draft real projects, vendors, topics, languages and models, set a weekly lineup, and win matchups on public measurements of what those picks did that week. Success: a first-time player can join with a code, understand what they are drafting, make their picks and follow their matchup without help.

## Positioning

Every point traces to a public source the player can open (CISA KEV, GitHub, GDELT, Hugging Face, a licensed stock feed). Nothing is scored by the browser or made up; missing data stays pending.

## Operating Context

1. Create a league, or join one with an invite code or link. Choose time per pick (30s, 60s, 90s default, 2 min, 5 min, 1 hour, 8 hours, or no timer). No account or email needed.
2. The commissioner starts an eight-round snake draft. Rounds 1 to 7 fill one position each, in order: DFIR, SOCIAL, SOC, VULN, DEF, LANG, AI. Round 8 is one bench pick from any position. With a pick timer, a draft only advances on timeout while at least one team has the page open. Managers can turn on autodraft to pick the highest-ranked candidate automatically.
3. Each week every player starts one pick per position. The bench pick can replace only a starter in its own position. Lineups lock Monday 00:00 UTC. Managers can turn on automatic weekly lineup setting.
4. Seven match weeks, head to head; ties allowed; no playoffs.

## Capabilities and Constraints

- Static site on GitHub Pages (plain HTML, CSS and JavaScript, no build step); Supabase for anonymous sessions, data and realtime.
- Guests can browse the draft pool (268 candidates), player ranks, the rules and the source feed before joining. This must stay.
- A player's identity lives on one device; leaving the device cannot be undone.
- Scores are public indicators, not counts of hacking incidents or judgments of a vendor's security.
- GDELT throttling leaves many Social Engineering scores pending. Defense (stock) scores are pending: no licensed data key is configured. The UI must show pending as pending.
- The earlier offline practice game is being removed.

## Brand Commitments

Name: Cipher League. Logo, colour and light or dark theme are open to change.

## Evidence on Hand

- `site/data/assets.json`: 268 candidates with position and public source URL.
- `site/data/events.json`: CISA KEV entries (filled at deploy time; empty in the repository).
- Live scores in Supabase. No testimonials, user counts or press; none may be invented.

## Product Principles

1. Always show what to do next.
2. Teach the term where it is first used.
3. Every score links to its evidence; pending is never shown as zero.
4. Say a limitation once, where it matters.
