## Purpose

Defines the consistent, modern frame every page lives in: navigation, quick capture, the Today overview, and the common list and detail page patterns that all modules reuse.

## ADDED Requirements

### Requirement: Navigation
The app SHALL show a sidebar on screens 768px and wider listing Today, Inbox (with unread count), each registered module, and Settings (plus Admin for admins). On narrower screens it MUST show a bottom bar with Today, Search, Create, Inbox, and Menu.

#### Scenario: Mobile navigation
- **WHEN** the viewport is 390px wide
- **THEN** the sidebar is hidden and the bottom bar is shown with touch targets at least 44px

### Requirement: Quick create
A global Create action SHALL let a member pick a module and create an entity with only its required fields, then optionally open the full detail page. When invoked from a place or entity page, it MUST prefill the place or a link.

#### Scenario: Prefilled place
- **WHEN** a member opens Create from the Kitchen page and picks a module with a non-hidden place rule
- **THEN** the place field is prefilled with Kitchen

### Requirement: Today page
The home page SHALL show, in order: Needs you (unread attention items), Due soon (the member's own due feed), Recent activity (grouped, compact), and Pinned entities. Each section MUST show an empty state that explains what will appear there. A slow section MUST NOT delay the display of the others.

#### Scenario: Pin an entity
- **WHEN** a member pins an entity
- **THEN** it appears under Pinned on their Today page only

#### Scenario: Due soon is personal
- **WHEN** a reminder's only recipient is Sam
- **THEN** it appears under Due soon on Sam's Today page and not on CJ's

### Requirement: Shared list and detail patterns
Every module SHALL use the same list view (search box, filter chips for tags, place, assignee, and module fields, sortable columns on wide screens and stacked rows on narrow screens, infinite scroll) and the same detail layout (header with title and key fields edited in place, then sections for module content, notes, related links, attachments, reminders, comments, and activity).

#### Scenario: Inline edit
- **WHEN** a member clicks a field on a detail page, changes it, and presses Enter or leaves the field
- **THEN** the value saves and a short confirmation appears, with no full-page reload

#### Scenario: Filters in URL
- **WHEN** a member applies filters to a list
- **THEN** the filters are reflected in the URL and restored on reload or when shared

### Requirement: Themes and accessibility
The app SHALL offer light, dark, and system themes per user. All text MUST meet WCAG AA contrast, interactive elements MUST have visible focus states, and every action MUST be operable by keyboard.

#### Scenario: System theme
- **WHEN** a member selects "System" and the OS is in dark mode
- **THEN** the app renders the dark theme

### Requirement: Feedback and safety
Destructive actions SHALL either be undoable via a toast with an Undo action or require confirmation. Pending server actions MUST show progress, and failures MUST show a readable error without losing user input. A conflict MUST explain that someone else changed the item and offer to reload.

#### Scenario: Delete with undo
- **WHEN** a member deletes an entity
- **THEN** a toast offers Undo for at least 8 seconds

#### Scenario: Stale inline edit
- **WHEN** a member saves an inline edit after someone else changed the same entity
- **THEN** the app shows that the item changed, keeps the member's value in the field, and offers to reload
