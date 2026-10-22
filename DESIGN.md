---
name: Compass
description: A values-first weekly planner that lives on your Home Screen.
colors:
  paper: "#F3F5F2"
  leaf: "#FFFFFF"
  pressed-paper: "#E9EDEA"
  ink: "#17201E"
  ink-soft: "#46524E"
  pencil: "#5E6865"
  hairline: "#D9DFDB"
  harbor-navy: "#23466F"
  harbor-mist: "#E2E9F3"
  on-navy: "#FFFFFF"
  brass: "#895D18"
  brass-wash: "#F4EAD8"
  moss: "#2B714F"
  moss-wash: "#DFEFE5"
  amber: "#95570C"
  amber-wash: "#F6E9D6"
typography:
  display:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.08em"
  numeric:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 500
rounded:
  hairline: "2px"
  field: "9px"
  control: "10px"
  card: "12px"
  panel: "14px"
  sheet: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
components:
  button-primary:
    backgroundColor: "{colors.harbor-navy}"
    textColor: "{colors.on-navy}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
    height: "40px"
  button-quiet:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    padding: "9px 8px"
  chip:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 12px 8px 10px"
    height: "40px"
  chip-selected:
    backgroundColor: "{colors.harbor-navy}"
    textColor: "{colors.on-navy}"
    rounded: "{rounded.pill}"
  card:
    backgroundColor: "{colors.leaf}"
    rounded: "{rounded.card}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 10px"
  sheet:
    backgroundColor: "{colors.leaf}"
    rounded: "{rounded.sheet}"
    padding: "6px 16px 18px"
---

# Design System: Compass

## Overview

**Creative North Star: "The Field Notebook"**

Compass should feel like a well-kept notebook you carry every day: cool paper, a serif hand for headings, small precise marks for what got done. It is a daily instrument, not a dashboard. Most visits last seconds (tick the day, add a task), so the system favours calm surfaces, generous tap targets and one clear action per screen. The longer moments, the Sunday review and the monthly look-back, get a little more room and a little more voice, but the same paper and ink.

Density is moderate and phone-first: a single 600px column, cards stacked with breathing room, bottom sheets for anything detailed. Colour is mostly paper and ink; a deep harbour navy carries action, brass marks what you chose to focus on (this week's three, Cores, 12-week goals), moss means done, amber means "needs care", never "you failed". Each value gets its own series colour for charts and dots, used sparingly.

Depth is moving from flat to softly lifted: cards and sections sit just above the paper on a gentle ambient shadow, while sheets and the floating add button float clearly higher. Borders stay hairline-thin.

**Key Characteristics:**
- Cool paper background, white leaves, near-black green-tinted ink.
- Serif (Newsreader) for headings and dates; IBM Plex Sans for everything you read and tap; Plex Mono only for small counts.
- One navy action per screen; brass for focus; moss for done; amber for care.
- Rounded, tactile controls with a small press response; bottom sheets for detail.
- Calm by default: no streaks, no red, no nagging badges.

## Colors

A cool, low-contrast paper palette with one navy action colour and three quiet semantic washes; every colour has a dark-theme counterpart defined alongside it.

### Primary
- **Harbor Navy** (#23466F; dark theme #93B3DC): the one primary action on a screen (Add, Save, Start this goal), selected chips and toggles, checked boxes, focus rings and the active tab. On **Harbor Mist** (#E2E9F3) it tints informational cards (Plan tomorrow, look-back, values quiz).

### Secondary
- **Brass** (#895D18; dark #D8A75C) with **Brass Wash** (#F4EAD8): focus and commitment. This week's three, Core values, 12-week goal tracks, today's weekday in the strip, the fun menu.

### Tertiary
- **Moss** (#2B714F; dark #72C69D) with **Moss Wash** (#DFEFE5): done and held. Ticked tasks, met floors, "Synced", repeat markers.
- **Amber** (#95570C; dark #E3A65C) with **Amber Wash** (#F6E9D6): needs care, never failure. Overdue dates, slipping tasks, "Let it go", destructive actions.

### Neutral
- **Paper** (#F3F5F2; dark #101514): the page background and input fields.
- **Leaf** (#FFFFFF; dark #191F1E): cards, sheets, the tab bar.
- **Pressed Paper** (#E9EDEA; dark #232B29): segmented-control tracks, empty bars, sheet close buttons.
- **Ink** (#17201E; dark #E7ECEA): primary text. **Ink Soft** (#46524E): secondary text and quiet buttons. **Pencil** (#5E6865): hints, meta, small labels.
- **Hairline** (#D9DFDB; dark #2D3533): every border and divider.
- **Value series** (eight hues, e.g. #2a78d6, #eb6834, #1baf7a; tuned per theme): one per value, only in charts, dots and value markers.

### Named Rules
**The One Navy Rule.** A screen has at most one filled navy button. Everything else is a secondary, quiet or chip control.

**The No Red Rule.** Compass never uses red for a person's own progress. Missed and overdue are amber; failure is not a state the app shows.

## Typography

**Display Font:** Newsreader (with Georgia, Times New Roman)
**Body Font:** IBM Plex Sans (with the system UI sans)
**Label/Mono Font:** IBM Plex Mono, for counts and figures only

**Character:** A bookish serif for names and dates gives the notebook its voice; a sturdy, friendly sans carries every task, label and button so the daily parts stay fast to read.

### Hierarchy
- **Display** (600, 34px, 1.08): page titles and the landing hero (the hero scales up to clamp(42px, 6.2vw, 74px)).
- **Headline** (600, 24px, 1.15): screen headings such as "Your compass", sheet titles, "Friday" on Tasks → Today (500, 30px).
- **Title** (600, 16–18px): card and section names (This week's three, 12-week goals, Plan tomorrow), list names (500, 26px).
- **Body** (400, 15px, 1.45): everything else; ledes cap at 62ch.
- **Label** (600, 12px, 0.08em tracking, uppercase): small section labels ("WHEN", "NEXT STEPS") in Pencil.
- **Numeric** (Plex Mono 500, 12–12.5px): counts like 2/3 and hours, with tabular figures.

### Named Rules
**The Serif Speaks, The Sans Works Rule.** Serif is for names, dates and headings only; never for buttons, inputs or body copy.

## Layout

A single centred column, max 600px, with 16px side gutters and a fixed bottom tab bar (plus the floating add button) on every screen. Sections stack vertically: a heading, then a card or a row of chips, separated by 18–22px. Bottom sheets rise from the tab bar for task detail, goals, sharing and planning, capped at 88% of the viewport and centred to 600px on desktop. Spacing steps are 4, 8, 12, 16 and 22px. The layout must hold at 320px wide with no sideways scrolling; grids collapse to one column below about 420px. Touch screens get 16px form text so iOS never zooms.

## Elevation & Depth

Softly lifted. Surfaces sit on Paper with hairline borders, and resting cards and sections get a faint ambient shadow so they read as leaves on a desk rather than outlines. Raised, temporary things float clearly higher: bottom sheets over a scrim, the floating add button, toasts. Selection inside a control is shown tonally (a white thumb on a Pressed Paper track), not with depth.

### Shadow Vocabulary
- **Leaf rest** (`box-shadow: 0 1px 2px rgba(18,26,24,.04), 0 2px 8px -2px rgba(18,26,24,.06)`): cards and Compass sections at rest. Dark theme drops it in favour of the border.
- **Control thumb** (`box-shadow: 0 1px 2px rgba(0,0,0,.08)`): the selected option in a segmented control; the switch knob.
- **Float** (`box-shadow: 0 10px 24px -8px rgba(10,20,30,.45)`): the floating add button.
- **Focus halo** (`box-shadow: 0 0 0 3px var(--accent-soft)`): the add-task box while typing.

### Named Rules
**The Leaf Rule.** Resting surfaces are lifted only as far as paper on a desk. Anything that floats higher must be temporary (a sheet, a toast) or the one persistent action (the add button).

## Shapes

Soft, friendly geometry. Cards and sections round at 12px, the add box and callout cards at 14px, sheets at 18px on their top corners, buttons at 10px, fields at 9px. Chips, pills, toasts and switches are fully rounded; tick circles and avatars are circles; day checkboxes are 7px rounded squares. Strokes are 1px hairlines, rising to 1.5px for unchecked ticks and boxes. Accent edges are drawn as a 3px left or top rule (This week's three, the slipping nudge), never a full coloured border.

## Components

### Buttons
Calm and tactile.
- **Shape:** gently rounded (10px), at least 40px tall (32px for small).
- **Primary:** Harbor Navy fill, white label, 500 weight. One per screen.
- **Secondary:** white leaf with a hairline border and ink label.
- **Quiet:** no border or fill, Ink Soft label; for Cancel, Not tonight, less likely actions. Destructive quiet buttons use Amber.
- **Press:** chips and the add button shrink slightly on press (scale .95 / .92); focus shows a 2px navy outline offset by 2px.

### Chips
- **Style:** white pill with a hairline border, 40px tall, 14px text; an optional bold navy "+" or a mono count inside.
- **State:** selected chips fill Harbor Navy with white text; done chips sit on Moss Wash; fun-menu chips on Brass Wash. Quick-add chips are smaller (26px) Harbor Mist pills.

### Cards / Containers
- **Corner Style:** 12px (sections), 14px (callouts).
- **Background:** Leaf, or a tinted wash for callouts (Harbor Mist for plan and insight cards, Brass Wash for focus, Amber Wash for care).
- **Shadow Strategy:** Leaf rest (see Elevation).
- **Border:** 1px Hairline; rows inside a card are divided by hairlines.
- **Internal Padding:** 12–16px; list rows are at least 52px tall.

### Inputs / Fields
- **Style:** Paper fill inside a Leaf card, 1px hairline, 9px radius, 9px 10px padding; the quick-add box is a borderless field inside a 14px leaf.
- **Focus:** navy border plus a 3px Harbor Mist halo.
- **Disabled:** 50% opacity.

### Navigation
A fixed bottom tab bar of five tabs (Today, Week, Tasks, Review, Compass): 22px line icons over 11.5px labels in Pencil; the active tab turns Harbor Navy and semibold. Within Tasks, views are pill buttons (Today, Upcoming, Inbox, each list), the active one filled ink. Compass sections fold open and closed with a chevron.

### Task row
A circular tick (24px, 1.5px Pencil stroke; Moss fill with a white check when done; brass stroke for Core values), the title in body text, and a meta line of small coloured words: the date (Moss today, Amber overdue), time, repeat, list, value, goal, steps, who. Completed rows slide right and fade.

### This week's three
A leaf with a 3px brass top rule and three brass-wash slots; empty slots are dashed outlines that invite picking one.

### Goal track
Twelve small rounded marks in a row, one per week of a 12-week goal: filled brass when the week moved it, half-filled for a little, a faint line for not really, the current week ringed.

### Bottom sheet
Leaf panel rising over a dark scrim with an 18px top radius, a grab handle and a round close button; content is a 600px column with 12px gaps.

## Do's and Don'ts

### Do:
- **Do** keep one filled Harbor Navy button per screen (The One Navy Rule).
- **Do** use Brass only for things the person chose to focus on: this week's three, Cores, goals.
- **Do** show misses and overdue items in Amber with kind words, and done in Moss.
- **Do** put detail in bottom sheets and keep the main column scannable.
- **Do** give every tappable thing at least a 40px target and check the layout at 320px.
- **Do** define every new colour for both light and dark themes.

### Don't:
- **Don't** use red, streak counters or scores that punish a missed day.
- **Don't** set buttons, inputs or body text in the serif.
- **Don't** stack several callout cards above the content a screen exists for; one invitation at a time.
- **Don't** add heavy or coloured shadows; resting surfaces lift only as far as paper on a desk.
- **Don't** use value series colours as decoration; they mark values in charts and dots only.
