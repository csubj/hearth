---
name: hearth
description: The household's shared record — a ruled ledger for home coordination.
colors:
  bone-paper: "#f2ecdf"
  paper-surface: "#f7f2e8"
  rule: "#d9d0bf"
  ink: "#211b12"
  slate: "#5e574a"
  rubric: "#9c2f1d"
  rubric-soft: "#f0e2d7"
typography:
  display:
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontWeight: 400
    lineHeight: 1
  body:
    fontFamily: "Spectral, ui-serif, Georgia, serif"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Spectral, ui-serif, Georgia, serif"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.14em"
    textTransform: uppercase
  ui:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontWeight: 500
    textTransform: uppercase
rounded:
  sm: "2px"
  md: "4px"
spacing:
  sm: "4px"
  md: "8px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: transparent
    textColor: "{colors.rubric}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.rubric-soft}"
    textColor: "{colors.rubric}"
  button-secondary:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  chip-status:
    backgroundColor: transparent
    textColor: "{colors.rubric}"
    rounded: "{rounded.sm}"
    border: "1px solid rgba(156, 47, 29, 0.3)"
---

# Design System: hearth

## Overview

**Creative North Star: "The Household Ledger"**

hearth is a bound ruled record book, not a dashboard. Every surface is a page of the household's shared record: entries written directly on unbleached bone paper, separated by hairline rules, marked rather than color-coded. The member opens it and sees the record as it stands — calm, glanceable, and shared by default — never a grid of widget cards and never a work tool.

The world is deliberately understated. There is exactly one hue beyond bone, ink, and slate: a deep rubric vermilion used as a mark, never as decoration. Geometry is angular and flat; the only depth comes from the ledger's own ruling and from one accent-outlined control. Typography is a high-contrast serif for the record voice and a small-caps serif for index labels, with a quiet neutral grotesk reserved for interactive chrome only.

**Key Characteristics:**
- A ruled book, never a card grid — surfaces are staves separated by hairline rules.
- One rubric accent marks attention, state, and the primary action.
- Angular, flat, paper-toned; no hard shadows, no gradients, no boxed panels.
- State is a mark (a struck line for done), never a color spectrum.
- Entries sit on a continuous ruled baseline grid, as handwriting does.

## Colors

The palette is bone paper, iron-black ink, slate gray, and one rubric vermilion. The paper is warm but not cream, and the accent is a deep editorial red, not a salmon terracotta.

### Primary
- **Rubric Vermilion** (#9c2f1d): The single accent. Used for the primary action's outline and text, links ("View all"), small-caps count markers that need attention, the active state, and the focus ring. It is a mark, not a fill; on light ground it is always outlined or text, never a filled block with white text.

### Neutral
- **Bone Paper** (#f2ecdf): The page ground. Every surface sits on it.
- **Paper Surface** (#f7f2e8): The lighter sheet, used for the write-in inputs and raised chrome, subtly lifted from the bone ground.
- **Rule** (#d9d0bf): The hairline that separates staves, rows, and baselines. Every border and rule in the system is this warm line.
- **Ink** (#211b12): The primary text and the serif record voice. Near-black iron, warm, never pure black.
- **Slate** (#5e574a): Secondary text, metadata, timestamps, and inactive labels.

### Named Rules
**The One Accent Rule.** Rubric vermilion appears on less than a tenth of any screen, used as attention marks and the primary action. Its rarity is the point.

**The Mark-Not-Color Rule.** State is a mark, not a hue. Done is a struck-through line; deferred is set aside, never deleted. There is no green "done" and no semantic color spectrum — `--color-success` resolves to slate, because success is a mark, not a second color.

## Typography

**Display Font:** Instrument Serif (with ui-serif, Georgia fallback)
**Body Font:** Spectral (with ui-serif, Georgia fallback)
**Label/Mono Font:** the label voice is small-caps Spectral; interactive chrome (buttons, inputs) uses the neutral system grotesk (`ui-sans-serif`)

**Character:** A high-contrast editorial serif for the record voice and the wordmark, paired with a readable book serif for body text — so the app reads as a printed record rather than an interface. Small-caps tracked labels carry the index and metadata. Buttons and form controls shift to a quiet grotesk so they behave like controls, not like the record.

### Hierarchy
- **Display / Masthead** (Instrument Serif 400, ~3rem, line-height 1): The "hearth" wordmark and page titles. High contrast, single weight, no bold display.
- **Headline** (Instrument Serif 400, ~1.125rem): Section staff titles on the record and detail pages.
- **Title** (Spectral 500, ~1rem): Entry titles and list item names.
- **Body** (Spectral 400, 1rem, line-height 1.75): Record content, entries, and descriptions. Measure ~65–75ch, matching the ruled page's rhythm.
- **Label** (Spectral 400, 0.75rem, tracking 0.14em, uppercase): Index rail, small-caps counts, field labels, and tags.

### Named Rules
**The One Voice Rule.** The record voice is serif. Buttons, inputs, and form controls are the only elements in the grotesk; a label or index item is never set in the system sans.

## Layout

The app sits in a single content column (`max-w-3xl`) inside a wider shell (`max-w-5xl`). On `md+` the home adds a narrow marginal index rail (`10rem`) on the left carrying a numbered small-caps section index; on mobile that rail collapses and the top index nav covers it.

The record is a ruled sheet: sections are detached staves separated by a top hairline rule, and entries are rows separated by a bottom hairline. There are no cards. The primary reading axis is the vertical ruled column, newest entries toward the top of the lead staff.

Rhythm is generous and calm: `space-y-8` between staves, `pb-4` under the masthead rule, hairline rules at the `1.75rem` body baseline. Both phones and laptops are first-class; on small screens the layout is a single scrolling ruled sheet, on larger screens the index rail appears beside it.

## Elevation & Depth

This system is flat by default. Surfaces are distinguished by tone (bone vs. lighter paper surface) and by hairline rules, never by shadows. There is no lift of boxed panels and no ambient glow.

The one place a shadow token exists (`--shadow-card`, an offset soft blur at 5% opacity) is vestigial and unused by the shipped components — the world's depth is the ledger's ruling, not elevation.

## Shapes

Geometry is angular and flat. Radii are minimal (`--radius-sm` 2px; `--radius-md`/`--radius-lg` 4px); a "card" is never rounded more than a hair. Corners are near-straight, borders are 1px warm rules, and there is no clipping or organic masking.

The recurring silhouette is a ruled line: a horizontal 1px rule under an entry or a stroke, and an outlined 1px box for the primary control. Nothing is a pill, a rounded card, or a soft shadowed rectangle.

## Components

### Buttons
- **Shape:** rectangular, 2px radius (44px tall for touch targets).
- **Primary:** transparent ground with a 1px rubric outline and rubric text (the ruled-outlined box). This is the world's primary action — an outlined mark, never a filled block.
- **Hover:** fills with rubric-soft tint. **Focus:** 1px rubric outline offset 2px.
- **Secondary:** 1px rule border on paper surface, ink text; on hover the border and text go rubric.
- **Ghost:** ink text, no box; hover turns rubric. **Destructive:** 1px muted red border, muted red text; hover tints — never an alarming filled modal.

### Chips / Tags
- **Style:** 1px border, small-caps Spectral label (2px radius), transparent ground.
- **Active / in-progress:** rubric outline + rubric text. **Neutral / idea:** rule border + slate text. **Done:** struck-through slate text with a transparent border — the entry itself is also struck.
- **Count markers:** small-caps slate text, no box; rubric when the count needs attention.

### Cards / Containers
- There are no boxed cards. The container is a ruled staff: a top hairline rule, content below, no background tint, no border box, no shadow. List items are ruled rows separated by a bottom hairline.
- **Internal Padding:** vertical padding at the row rhythm; a staff has ~`pt-4` under its top rule.

### Inputs / Fields
- **Style:** 1px rule border on paper surface, 2px radius; text in ink. Search inputs render as ruled write-in fields.
- **Write-a-line capture:** a single transparent input with only a bottom rule — a line you write into.
- **Focus:** the 1px border shifts to rubric. **Placeholder:** slate, ~4.5:1.

### Navigation
- **Style:** index voice — small-caps serif labels with a horizontal 1px rule under the masthead. The active item is ink; others slate, hover rubric.
- **Mobile:** the index wraps to its own rows (never a clipped horizontal scroll). Dropdown panels are flat paper with a 1px rule and no shadow.

### Signature Component — the Marginal Index Rail
A narrow left-hand index on `md+` (hidden on mobile) listing the record's sections in numbered small-caps, each row with a 1px left rule and a tabular number. It is the record's table of contents — a running index, not a sidebar of links with icons.

## Do's and Don'ts

### Do:
- **Do** put content directly on the bone ground and separate it with hairline rules, never inside a boxed card.
- **Do** use rubric vermilion only as an attention mark or the primary action's outline.
- **Do** mark done as a struck-through line, both in the status tag and on the entry.
- **Do** set index labels, tags, and count markers in small-caps Spectral; keep the grotesk for buttons and inputs only.
- **Do** let entries sit on the ruled baseline grid (1.75rem) so they read as handwriting on the sheet.

### Don't:
- **Don't** build a card grid, a sidebar of icon links, or a counted hero-metric strip.
- **Don't** use a color spectrum for state; done is a mark, not a green chip.
- **Don't** use a system display face, gradient text, hard offset shadows, or thick colored side borders.
- **Don't** set the record voice in a grotesk or the controls in the serif.
- **Don't** fill the primary action solid with white text; keep it an outlined ruled box.
