---
doc: styling
project: hearth
version: 1
status: decided
last_updated: 2026-06-14
related:
  - docs/design/00_init.md
  - docs/design/01_tech.md
---

# Styling & UI

Structured reference for agents and contributors. Product tone in `00_init.md` (Design principles); this doc covers visual system and component conventions.

**Goal:** warm, calm, glanceable — a family notebook, not a SaaS dashboard.

---

## Stack

| Field           | Value                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Choice**      | Tailwind CSS v4 + CSS variables                                                                                                                                                                                                |
| **Role**        | Utility-first layout and spacing; design tokens via `@theme`                                                                                                                                                                   |
| **Rationale**   | Fast iteration, consistent spacing, pairs well with Next.js App Router and Radix unstyled primitives. One toolchain for responsive layout without fighting CSS modules for every prop.                                         |
| **Conventions** | Global tokens in `app/globals.css`. Component-specific classes inline with Tailwind. Avoid `@apply` except for repeated form control base styles. Do not add MUI, Chakra, or shadcn as a full dependency — wrap Radix locally. |
| **References**  | https://tailwindcss.com · `docs/design/05_styling.md`                                                                                                                                                                          |

| Field           | Value                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Radix UI primitives (from `01_tech.md`)                                                                                                     |
| **Role**        | Accessible dialogs, dropdowns, popovers, tabs                                                                                               |
| **Conventions** | Styled wrappers in `src/components/ui/` (e.g. `Button`, `Dialog`, `DropdownMenu`). Pages import wrappers, not `@radix-ui/react-*` directly. |

| Field           | Value                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| **Choice**      | `next/font` — DM Sans + optional serif accent                                        |
| **Role**        | Typography without layout shift                                                      |
| **Conventions** | `--font-sans` for UI; `--font-serif` sparingly for page title "hearth" wordmark only |

---

## Design tokens

Define in `app/globals.css` under `@theme`:

```css
/* conceptual — implement in globals.css */
--color-background: /* warm off-white, e.g. #faf8f5 */
  --color-surface: /* card white #ffffff */ --color-border: /* soft gray #e8e4df */
    --color-text: /* near-black #1c1917 */ --color-text-muted: /* #78716c */
    --color-accent: /* terracotta / hearth orange #c2410c */
    --color-accent-soft: /* light tint for hovers */
    --color-success: /* muted green for done states */ --radius-sm: 0.375rem --radius-md: 0.5rem
    --radius-lg: 0.75rem --shadow-card: subtle,
  warm gray;
```

**Palette direction:** warm neutrals, one accent color (hearth/ember), minimal semantic colors. No bright corporate blue.

---

## Typography scale

| Token                 | Use                                 |
| --------------------- | ----------------------------------- |
| `text-2xl font-serif` | Page title "hearth", section heroes |
| `text-lg font-medium` | Section headings on home            |
| `text-base`           | Body, list items                    |
| `text-sm text-muted`  | Timestamps, metadata, hints         |
| `text-xs text-muted`  | Badges, counts                      |

Line height relaxed (`leading-relaxed`) for note-like content.

---

## Layout

| Pattern           | Spec                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| Max content width | `max-w-3xl` for lists and forms; `max-w-5xl` for home grid                |
| Page padding      | `px-4 py-6` mobile; `px-6 py-8` md+                                       |
| App nav           | Top bar, sticky; horizontal links on md+, bottom or menu on small screens |
| Home              | Single column on mobile; two-column section grid on `md:`                 |
| Cards             | `rounded-lg border bg-surface shadow-card p-4`                            |

---

## Component patterns

### Lists (stream, restaurants, projects, metrics, inventory)

- **Lead with existing content** — the list, history, or searchable catalog is the first element on the page
- Full-width rows or cards with clear primary line + muted secondary line
- Actions (pin, done, edit) appear on hover/focus or in a `⋯` dropdown — not always visible
- Empty state: one line of friendly copy + primary action button

### Quick capture / create

- **Secondary affordance** — a compact "Add" / "New …" button in the page header, or a collapsed/expandable form (Radix `Collapsible`), not a large form at the top of the page
- Stream is the exception for quick capture — it may keep an inline textarea, but still below any pinned/recent items on the home summary
- Submit button labeled simply: "Add", not "Create task"
- No modal for simple adds unless the form is large (inventory item with many fields)

### Charts (metrics)

- `MetricChart` client component (Recharts) on `/metrics/[id]`
- Line chart for numeric values; X-axis = `recorded_at`, Y-axis = value with optional unit label
- Chart is the lead element on the detail page; entry table/cards below
- Non-numeric metrics skip the chart and show the entry list only
- Responsive: chart fills container width; height ~240px on mobile, ~320px on desktop
- Muted grid lines; accent color for the line/points; tooltip on hover with value + date + note

### Inventory

- **Search bar** pinned at top of list (inventory leads with findability, not capture)
- **Tag chips** — filter by tag; selected tags highlighted with accent outline
- **Item card** — name prominent; secondary line: type · location · model; tag chips inline
- **Detail page** — metadata grid (brand, model, serial, purchase info); links section; photo + document file list; notes at bottom
- **Compact create** — "Add item" in header opens collapsible form or Radix `Dialog` for the full field set

### Forms

- Labels above fields; `text-sm font-medium`
- Inputs: `w-full rounded-md border border-border bg-background px-3 py-2`
- Errors inline below field in `text-sm text-red-600`
- Destructive actions use muted red, not alarming modals unless irreversible

### Status chips

| Feature                | Chip styles                    |
| ---------------------- | ------------------------------ |
| Stream open            | default text                   |
| Stream done            | muted + strikethrough optional |
| Restaurant want_to_try | accent outline                 |
| Restaurant visited     | muted + stars                  |
| Project idea           | neutral                        |
| Project in_progress    | accent soft background         |
| Project done           | muted green                    |

### Notifications bell

- Unread count badge on nav icon
- Feed: actor name bold, summary regular, timestamp muted

### Photos

- Thumbnail grid `grid grid-cols-3 gap-2` on detail views
- Rounded corners `rounded-md`, click to expand (Radix Dialog)

---

## Radix wrappers (`src/components/ui/`)

Implement as needed during MVP phases:

| Component      | Radix package                   | Notes                                                          |
| -------------- | ------------------------------- | -------------------------------------------------------------- |
| `Button`       | —                               | native button + Tailwind variants (see below)                  |
| `Dialog`       | `@radix-ui/react-dialog`        | edit forms, photo lightbox                                     |
| `DropdownMenu` | `@radix-ui/react-dropdown-menu` | row actions, user menu                                         |
| `Popover`      | `@radix-ui/react-popover`       | @-mention autocomplete                                         |
| `Tabs`         | `@radix-ui/react-tabs`          | metric chart/table toggle if needed      |
| `Collapsible`  | `@radix-ui/react-collapsible`   | compact create forms, expandable capture                       |

### Button variants

Use variants to reflect **where** the action lives in the UI:

| Variant       | Use case                                      | Example                          |
| ------------- | --------------------------------------------- | -------------------------------- |
| `primary`     | Section form submit                           | Add reminder, Save changes       |
| `secondary`   | Page-header create / expand triggers          | New metric, Add item             |
| `soft`        | In-card / list-item actions                   | Mark done, Add link              |
| `destructive` | Delete within a card                          | Delete reminder                  |
| `ghost`       | Minimal chrome (nav-adjacent, rare)           | —                                |

Do not use `ghost` for primary create or card actions — it reads as plain text.

---

## Responsive behavior

- **Mobile first:** nav collapses to hamburger or bottom tab bar (pick one in implementation; document in component)
- Touch targets minimum `44px` height for buttons
- Tables (metric history) → stacked cards on `sm`

---

## Accessibility

- Radix handles focus trap and ARIA for primitives
- Visible focus rings: `focus-visible:ring-2 focus-visible:ring-accent`
- Color contrast WCAG AA for text on background
- Prefer semantic HTML: `main`, `nav`, `article` per entry

---

## Dark mode

Out of scope for v1. Structure tokens as CSS variables so dark mode can be added later without refactors.

---

## Styling summary (machine-readable)

```yaml
styling:
  css: tailwindcss v4
  tokens: css_variables in app/globals.css
  fonts:
    sans: DM Sans
    serif: optional accent for wordmark
  primitives: radix-ui
  ui_wrappers_dir: src/components/ui
  component_dir: src/components
  charting: recharts
  layout_principle: show_what_exists_first
  dark_mode: false
  design_tone: warm, calm, notebook-like
```
