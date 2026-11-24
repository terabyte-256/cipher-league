---
name: Cipher League
description: A seven-line transit map for a fantasy cybersecurity league
colors:
  wall: "#ffffff"
  floor: "#f1f3f4"
  ink: "#111214"
  muted: "#4a515a"
  rule: "#c8cdd3"
  link: "#0057a8"
  error: "#a50d25"
  line-forensics: "#c8102e"
  line-social: "#e87500"
  line-detection: "#b58900"
  line-vulnerabilities: "#00793a"
  line-stocks: "#0057a8"
  line-languages: "#7b4b2a"
  line-ai: "#00808a"
typography:
  headline:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.15
  body:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
rounded:
  sm: "4px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "32px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.wall}"
    rounded: "{rounded.sm}"
    padding: "8px 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.wall}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 20px"
  input:
    backgroundColor: "{colors.wall}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "44px"
---

# Design System: Cipher League

## Overview

**Creative North Star: "The Line Map"**

The game's seven positions are seven transit lines. A white station wall carries content, one black sign band carries navigation, and colour appears only to say which line something belongs to. The audience is students, often on phones, so every screen opens with the next thing to do and teaches a position where it first appears.

**Key Characteristics:**
- One next action at the top of each screen, closed by a heavy black rule.
- Lists and tables on the wall; no cards, shadows or gradients.
- Each position keeps one letter and one colour everywhere.

## Colors

Black on white, plus seven line colours that mean position and nothing else.

### Neutral
- **Ink** (#111214): text, sign band, primary buttons, heavy rules.
- **Wall** (#ffffff) and **Floor** (#f1f3f4): page ground; selected or taken rows.
- **Muted** (#4a515a) and **Rule** (#c8cdd3): secondary text; hairlines.

### Position lines
Forensics F #c8102e, Social engineering S #e87500, Detection D #b58900, Vulnerabilities V #00793a, Tech stocks T #0057a8, Languages L #7b4b2a, AI models A #00808a. The bench B is white with an ink ring.

### Named Rules
**The Letter Rule.** A line colour never appears without its letter or the position name nearby.
**The Line-Style Rule.** Final is a solid bar, provisional an outlined bar, pending a dashed line with the word "Pending". A missing score is never drawn or counted as zero.

## Typography

**Family:** Overpass (self-hosted variable font in `site/fonts/`), with system-ui fallback.

**Character:** a face drawn from road signage; heavy for headings, plain for reading. Numbers are tabular.

### Hierarchy
- **Headline** (800, 2.25rem, 1.75rem on phones): the next action.
- **Title** (800, 1.375rem): section headings.
- **Body** (400, 1rem, max 68ch).
- **Label** (700, 0.875rem): form labels, tabs, small metadata. Sentence case.

## Layout

One column up to 1180px with 32px gutters (16px under 700px). Draft shows candidates beside the route at 961px and up; below that they stack, route first when it is not your turn. Matchups are a three-column comparison with the position bullet in the middle, bars growing outward on one 0 to 35 scale. Navigation is four tabs in the sign band, a full-width row on phones; there is no drawer.

## Elevation & Depth

Flat. Hierarchy comes from rules (4px under the next action, 2px above a list, 1px between rows). Only toasts cast a shadow.

## Shapes

4px corners on buttons and inputs. Circles are reserved for position bullets and route stations. Filter chips are pills.

## Components

- **Next action:** headline, one or two sentences, one filled button, then a 4px ink rule.
- **Buttons:** filled ink, outlined, or underlined quiet link; 44px minimum height.
- **Position bullet:** 32px circle with the line letter.
- **Row list:** bullet, name and detail, one control at the end.
- **Draft route (signature):** a table of rounds by teams; the line reverses each round. Made picks solid, future dashed, the current station enlarged.
- **Seats:** league members as stations on a vertical line; open seats dashed.

## Do's and Don'ts

### Do:
- **Do** open a screen with what to do next.
- **Do** explain a position where it appears.
- **Do** link every score to its source.

### Don't:
- **Don't** use a line colour as decoration or for buttons.
- **Don't** add cards, gradients, glows, eyebrow labels or glyph icons.
- **Don't** set labels in all capitals or write slogans.
