# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A small household: partners, roommates, or family. They already coordinate informally through texts, scraps of paper, and mental notes. A household instance admin creates accounts, sets and resets passwords, and removes users. There is no self-service registration. Every authenticated user in an instance sees the same shared household data.

## Product Purpose

hearth is a shared surface for coordination between people in a household. Like a refrigerator door or a kitchen whiteboard, it holds shared information everyone can see at a glance: what needs attention now, what the household is planning, and notes they do not want to lose. It is not a corporate task manager. It succeeds when opening it feels like walking into the kitchen and seeing what is on the board.

## Positioning

The household is the unit, and everything is shared by default. The product replaces scattered coordination with one trusted current surface for the small, ongoing things of domestic life: errands half-remembered, restaurants someone mentioned, a project stalled in the garage, a pet's last weight. It uses gentle structure (lists and maps, not workflows) and low-friction capture, so an item can sit idle for months without feeling overdue or broken. It runs as a per-household instance today and is designed so the same product can later host multiple households or structures.

## Operating Context

Members open hearth from phones and laptops, mostly at home, in short glances. Both device classes are first-class; no device is a degraded afterthought. Access is per instance and can be either required login or open mode for a trusted private network. The home page is a glanceable summary, not a dashboard of widgets, and detailed work lives one click deeper.

## Capabilities and Constraints

- Restaurants to try: list of places with status (want to try, visited), a 1-5 rating and note after a visit, and filters.
- House projects: title, description, status (idea, in progress, done), and optional components.
- Metrics: named metrics with dated entries; numeric metrics render as a line/point chart over time, with a table view for exact values.
- Inventory: searchable catalog of physical things with tags, kinds, links, photos, and permitted documents; bulk import and export.
- House maintenance: a log of services, repairs, and warranties with category, company, cost, dates, and follow-up reminders.
- Home log and notification stream with @-mentions.
- Attachments: photos across freeform content; documents are additionally allowed on inventory items.
- Programmatic REST API under /api/v1 with bearer tokens and a self-describing OpenAPI spec.
- One instance equals one household today; the design must extend to multiple households or structures without a rewrite.
- Responsive web only; no mobile native app. Out of scope: push notifications, email digests, Maps integration, and multi-household-per-instance for now.

## Brand Commitments

- Name: hearth. Not negotiable.
- Tone: warm, informal, home not work. Closer to a family notebook than a project management tool.
- Voice is calm and plain; copy should not sound corporate or gamified.
- Prominent features must stay glanceable first, show existing content first, keep capture as a secondary affordance, and stay shared by default.
- No loud or stressful visual language; the household context is domestic and quiet.

## Evidence on Hand

- A working Next.js app with the full data model and routes implemented.
- Design docs under docs/design/ (00_init through 10_ci) describe product vision, stack, schema, routes, styling, notifications, attachments, deployment, and CI.
- docs/design/05_styling.md documents the incumbent visual system: warm neutrals, terracotta accent, DM Sans.
- The app already supports user-selectable themes (default, warm, dark, gamer).

## Product Principles

1. Glanceable first: the home page answers what is going on in a few seconds; detail lives one click deeper.
2. Show what exists first: every page leads with the list, history, or catalog; adding is a deliberate secondary affordance.
3. Low friction to capture: capture sits one tap away, behind the content rather than in front of it.
4. Shared by default: everything in the instance is visible to the household; private notes belong elsewhere.
5. Gentle structure: lists and maps, not workflows; idle items are not overdue.
6. Feels like home, not work: warm, informal, closer to a family notebook than a project tool.

## Accessibility & Inclusion

- WCAG AA contrast for text on background.
- Visible focus rings on interactive elements.
- Semantic HTML and Radix-managed ARIA for primitives.
- Minimum 44px touch targets on mobile.
- Supports alternative color themes, including a dark mode.
