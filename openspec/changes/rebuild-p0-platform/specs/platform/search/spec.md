## Purpose

Makes search the fastest way to find and jump to anything in hearth, across all modules, places, tags, and text content.

## ADDED Requirements

### Requirement: Global full-text search
The system SHALL search entity titles, module text fields, notes, and comments across all modules, ranked by relevance with title matches ranked higher, excluding archived and trashed entities. The last word of the query MUST also match as a prefix.

#### Scenario: Match in notes
- **WHEN** a member searches "alabaster"
- **THEN** an inventory item whose notes contain "Alabaster" is returned with a highlighted snippet

#### Scenario: Match while typing
- **WHEN** a member has typed "alab"
- **THEN** the item with "Alabaster" in its title is already returned

### Requirement: Search filters
Search SHALL accept filters `type:<module>`, `place:<name>`, `tag:<name>`, and `@<member>` (assigned to), combinable with free text. `place:` MUST include descendants. When several places share the name, `place:` MUST include all of them.

#### Scenario: Place filter
- **WHEN** a member searches `place:kitchen paint`
- **THEN** results are limited to entities in Kitchen or its descendants that match "paint"

#### Scenario: Ambiguous place name
- **WHEN** both "Main House" and "Cabin" have a room named "Kitchen" and a member searches `place:kitchen`
- **THEN** results include entities from both kitchens

### Requirement: Command palette
Pressing Cmd/Ctrl-K anywhere SHALL open a palette that searches entities and offers actions (create any module type, go to any section, switch property). Results MUST be keyboard navigable.

#### Scenario: Jump to entity
- **WHEN** a member presses Cmd-K, types part of a title, and presses Enter
- **THEN** the app opens that entity's detail page

### Requirement: Index freshness
Search results SHALL reflect a write as soon as that write completes. If the search index is found to be out of date with the stored data, the system MUST repair it automatically.

#### Scenario: New item searchable
- **WHEN** a member creates an entity and immediately searches its title
- **THEN** it appears in the results

#### Scenario: Index repaired
- **WHEN** index entries are missing for existing entities
- **THEN** the next daily maintenance run restores them and logs the repair
