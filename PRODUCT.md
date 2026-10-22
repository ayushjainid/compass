# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The public: anyone who finds Compass should be able to sign up and get value without the maker's help. In practice they are adults who want their weeks to reflect what they say matters (relationships, health, learning, craft, money, and so on) and who have tried task apps or habit trackers that left them busy but not aligned. They use it most on a phone, from the iPhone or Android Home Screen, in short moments: ticking off the day in the evening, adding a task on the go, and a longer Sunday review. People they invite (list collaborators and accountability partners, called watchers) are secondary users who may only touch one shared list or one person's weekly summary.

## Product Purpose

Compass turns a person's values into a realistic week and shows whether their life is actually matching what they say matters. Success is a person who, week after week, holds small floors for each value, knows what this week is for, and feels at peace with where things are trending, without the app demanding more attention than it gives back.

## Positioning

Values-first floors. You start from your values (found with a 10-question, research-based quiz if you like), set small weekly minimums ("floors") for each one within a real time budget, and plan, log, review and look back against those values. Tasks are said to serve a value. The Sunday review and monthly look-back measure alignment ("where your month went") rather than productivity. A to-do app, Notion or a habit tracker can't truthfully claim this: they count output or streaks, not whether your week served what matters to you.

## Operating Context

- Daily: Today screen with the day's floors and tasks; quick ticks; a three-line journal; an optional evening reminder (at most one, skipped if the app was opened that day) and, after 4 pm, "Plan tomorrow".
- Weekly: a Sunday review (floors per value, felt-sense 1–5, what made it fun, next week's three, 12-week goals), with a Sunday nudge.
- Monthly: a look-back by value; 12-week goals in Compass → Season.
- Tasks: Todoist-style lists with natural-language quick add, an Inbox, Today/Upcoming views, shared lists by invite link, and `@name` to give someone a task.
- Together: invite links, shared lists, accountability partners who see a weekly summary and send cheers; notifications between people respect quiet hours.
- Outside the app: a live calendar subscription (webcal) for planned floors and timed tasks; push reminders through a Cloudflare Worker.

## Capabilities and Constraints

- Single-file progressive web app (`public/index.html`) on Firebase Hosting and Firestore; installs to the Home Screen; works offline and syncs across devices.
- iPhone only allows notifications for the Home Screen app, so reminder flows must account for that.
- Free-tier budgets matter (Firestore reads/writes, Worker CPU per minute); features must stay cheap per user.
- Terminology to keep: value, Core (up to two values getting most energy for 12–18 months), floor, safety net / Minimum Viable Week, this week's three, Sunday review, look-back, watcher / accountability partner, cheer, Inbox, 12-week goal, Plan tomorrow.
- Everything is tested end to end on Chromium, WebKit (iPhone engine), Firefox and Android before it ships; visual changes must keep those suites green.
- Open: no paid tier, no marketing site beyond the in-app landing page; pricing is undecided and must not be implied.

## Brand Commitments

- Name: Compass. Domain: life-compass.web.app.
- Voice: warm, plain and light, sometimes playful, never guilt-tripping ("Floors, not ceilings", "No streak police here"). Misses are information, not failure.
- The UI stays calm and uncluttered: one memorable element per screen at most; nothing nags.
- No streaks, no shaming of missed days, no scores that punish.

## Evidence on Hand

- Research the product cites in its own copy: Schwartz's Portrait Values Questionnaire and the Valued Living Questionnaire (values quiz), Gollwitzer & Sheeran 2006 (implementation intentions, if-then rules, planning tomorrow), Harkin et al. 2016 (monitoring and reporting progress, accountability partners), Moran & Lennington's *The 12 Week Year* (12-week goals).
- No testimonials, user counts, press, reviews or outcome statistics exist. Future work must not invent them.

## Product Principles

1. Values before tasks: every surface should help answer "is my week serving what matters to me?", not "how much did I do?".
2. Floors, not ceilings: ask for the small minimum that keeps a value alive; celebrate holding it, never shame missing it.
3. Calm by default: the app earns attention in short moments and then gets out of the way; nudges are rare, skippable and kind.
4. Phone first: designed for one-handed use from the Home Screen; desktop is a comfortable second.
5. Honest claims: behavioural advice cites real research; nothing is fabricated or overstated.

## Accessibility & Inclusion

- Automated accessibility scans (axe) run on every main screen and sheet in CI; keep them clean (the viewport zoom setting is a known, accepted exception).
- Light and dark themes; reduced motion is respected; layouts must work down to 320 px wide with no sideways scrolling.
- Touch targets sized for phones; every action reachable by keyboard on desktop.
