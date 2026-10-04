## Purpose

Lets a household record multiple properties and the spaces inside them, attach any item to a place, and see or filter everything within a property, room, or area.

## ADDED Requirements

### Requirement: Place hierarchy
The system SHALL store places as a tree with kinds `property`, `structure`, `room`, and `area`. A household MAY have multiple properties. Properties MUST be top-level, and every other place MUST have a parent.

#### Scenario: Multiple properties
- **WHEN** a member creates properties "Main House" and "Cabin"
- **THEN** both appear as top-level places

#### Scenario: Room needs a parent
- **WHEN** a member tries to create a room without a parent
- **THEN** the system rejects it with a validation error

#### Scenario: Move a space
- **WHEN** a member moves "Pantry" from "Kitchen" to "Garage"
- **THEN** all items placed in "Pantry" now roll up under "Garage" and its property

#### Scenario: No cycles
- **WHEN** a member tries to move a place under one of its own descendants
- **THEN** the system rejects the move

### Requirement: Placing entities
Any entity MAY reference at most one place, and that reference MUST point to a place. Each module SHALL declare its place rule: required, prominent, optional, or hidden. Additional place relationships use links.

#### Scenario: Hidden rule
- **WHEN** a module declares the place rule as hidden
- **THEN** its create and edit forms show no place field

#### Scenario: Required rule
- **WHEN** a module declares the place rule as required and an entity is created without a place
- **THEN** the system rejects it with a validation error

### Requirement: Subtree rollup
Viewing or filtering by a place SHALL include entities placed in that place and all its descendants by default, with an option to show only the exact place.

#### Scenario: Rollup counts
- **WHEN** a member opens "Main House"
- **THEN** they see entities placed in the house and in every room and area under it, grouped by module, with counts per child space

#### Scenario: This level only
- **WHEN** the member switches to "this level only"
- **THEN** only entities placed directly on "Main House" are shown

### Requirement: Property scope switcher
The app SHALL offer a global property scope (All or one property) that filters lists, Today's due and activity sections, the due feed, and search. The choice MUST persist per user. Entities without a place MUST always remain visible regardless of scope. The inbox MUST NOT be filtered by scope.

#### Scenario: Scoped Today
- **WHEN** a member selects "Cabin"
- **THEN** Today shows only reminders and activity for entities under the Cabin or with no place

#### Scenario: Inbox ignores scope
- **WHEN** a member is mentioned on an entity in "Main House" while their scope is "Cabin"
- **THEN** the mention still appears in their inbox and bell count

### Requirement: Deleting a place
Deleting a place SHALL move it and its descendants to trash as one action, and restoring it MUST restore everything trashed with it. A place MUST NOT be restored while its parent is in trash. Entities placed there MUST NOT be deleted and MUST become unplaced only if the place is permanently purged.

#### Scenario: Items survive
- **WHEN** a member deletes "Garage"
- **THEN** items in the Garage remain and show their place as trashed until restored or purged

#### Scenario: Restore the subtree
- **WHEN** a member restores "Garage" from trash
- **THEN** "Garage" and every space that was trashed with it are back in the tree

#### Scenario: Child restore blocked
- **WHEN** a member tries to restore "Workbench" while its parent "Garage" is still in trash
- **THEN** the system rejects it and explains that the parent must be restored first
