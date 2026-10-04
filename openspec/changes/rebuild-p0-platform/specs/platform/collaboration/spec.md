## Purpose

Lets household members record knowledge on any item, discuss it, ask a specific person for attention, and say who is responsible for it — from the web UI or through the API as Markdown.

## ADDED Requirements

### Requirement: Notes document
Each entity of a module that enables notes SHALL have one rich-text notes document supporting headings, lists, checklists, links, and @mentions. Notes MUST be writable either as a rich-text document or as Markdown, and reads MUST return both forms. Notes saves MUST use the concurrent edit protection of entities: a save based on an outdated version is rejected as a conflict.

#### Scenario: Edit notes in place
- **WHEN** a member edits notes on a detail page and pauses typing or leaves the editor
- **THEN** the notes save without a separate form submit

#### Scenario: Markdown from an agent
- **WHEN** an API client writes notes as Markdown containing a checklist and `@sam`
- **THEN** the web editor shows a checklist and a mention of Sam, and Sam receives one attention item

#### Scenario: Conflicting notes edit
- **WHEN** a member saves notes that someone else changed after the member's editor loaded
- **THEN** the save is refused, the member is offered to reload or overwrite, and their unsaved text is kept

#### Scenario: Unsaved text survives
- **WHEN** a notes save fails or the page reloads before a save succeeds
- **THEN** the member's unsaved text is still in the editor

### Requirement: Comments
Entities SHALL support a chronological comment thread. Comments MUST accept the same rich text or Markdown as notes. Authors MAY edit or delete their own comments; admins MAY delete any comment.

#### Scenario: Add comment
- **WHEN** a member posts a comment
- **THEN** it appears in the thread with author, time, and channel

### Requirement: Mentions
Typing `@` in notes or comments SHALL offer a picker of active members. In Markdown, `@username` of an active member MUST be treated as a mention. A mention MUST notify the mentioned member once per newly added mention; re-saving unchanged text MUST NOT notify again.

#### Scenario: New mention
- **WHEN** a member posts a comment mentioning @sam
- **THEN** Sam gets one attention item linking to that comment

#### Scenario: Unchanged notes
- **WHEN** notes that already mention @sam are saved again with other edits
- **THEN** Sam is not notified again

### Requirement: Multiple assignees
An entity SHALL support zero or more assignees from the household's active members. Being added as an assignee MUST create an attention item for that member unless they assigned themselves.

#### Scenario: Assign two people
- **WHEN** a member assigns CJ and Sam to a project
- **THEN** both appear as assignees and each receives one attention item (except the member who did it)
