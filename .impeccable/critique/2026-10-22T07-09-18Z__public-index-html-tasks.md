---
target: tasks
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/claude/compass/public/index.html#tasks"
timestamp: 2026-10-22T07-09-18Z
slug: public-index-html-tasks
closed: true
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score: 26/40 (Acceptable, near Good)
1 Visibility 3 (Inbox pill count hides dated Inbox tasks) · 2 Real world 3 ("This week" meta ambiguous) · 3 Control 3 (sheet autosaves, no back-out) · 4 Consistency 2 (3-4 navy fills; ink vs navy selected; square vs round ticks; no leaf shadow) · 5 Error prevention 3 (no full-day signal on Today) · 6 Recognition 2 (focus task duplicated; quick-add syntax hidden) · 7 Efficiency 3 (no swipe) · 8 Minimalism 2 (stacked header/cards; two callouts) · 9 Recovery 3 · 10 Help 2 (no "what can I type")

## Design specificity
Half authored (three strip, slip card, Let it go, Plan tomorrow), half Todoist frame. Values nearly invisible on Tasks (grey meta only). Detector: clean, 44 advisory token drifts (2 in Tasks: .tpill .avs i 9.5px; .focus 4px radius). Browser: .focus and .slipcard accent stripe on rounded card; #iNote and #iSubIn placeholder contrast 4.2:1. False positives: needle wobble bounce, weeknav nested card, 11.5px sync text. axe: only accepted meta-viewport.

## Priority issues
- [P1] Task list below the fold behind stacked callouts (first row y=703 of 844; FAB covers first row). Fix: hide weeknav on Tasks, merge day heading, one callout at a time, slip prompt inline, FAB clearance. → distill, layout
- [P1] Values barely visible. Fix: value colour dot in lmeta, "Today serves" line, Serves? chip in quick add. → shape / bolder
- [P1] Touch targets: .tick 24px hit area, .planx/.uadd 32px, qchips 26px. Fix: 44px tick hit area; 40px others. → harden
- [P2] DESIGN.md rules unapplied: navy fills (Add, Plan, FAB, Sort), no leaf-rest shadow, stripe-on-rounded (.focus, .slipcard), placeholder contrast. → polish
- [P2] Item sheet ~20 equal-weight controls; serif title input; 3 equal footer buttons. Fix: When/three/Serves up front, rest under More. → distill

## Persona red flags
Casey: 700px before list, 24px ticks at left edge, FAB over row, no swipe, .tnav no scroll-padding (first pill flush to edge). Jordan: jargon burst in sheet, Inbox count mismatch, "0 of 3 values cleared" reads as a grade. Sam: small targets, placeholder contrast, heavy native focus border on date input.

## Minor
Today heading sans vs Upcoming serif; 14 days incl ~10 empty in Upcoming; Plan sheet sticky footer overlaps last row; "Today" repeated under "Left from today"; "0 of 1 done" vs "1 of 3 picked"; 320px placeholder wraps; × vs ✕; dead `${wk.length ? "" : ""}` in vToday.

## Questions
Group Today by value? The one thing Compass wants at 6:30 pm? Should Tasks have its own Today?
