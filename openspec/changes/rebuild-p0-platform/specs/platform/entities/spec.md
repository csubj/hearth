## Purpose

Defines the shared record that every module item is built on, how the household shares data, protection against conflicting edits, soft deletion, and the module registry contract that lets new types be added consistently.

## ADDED Requirements

### Requirement: Shared household data
An instance SHALL hold exactly one household. Every active user is a member of it and MUST be able to read and write all household data; there are no private entities. Disabled users MUST have no access.

#### Scenario: New member sees existing data
- **WHEN** an admin creates a new member and that member signs in
- **THEN** the member sees every existing non-archived, non-trashed entity

### Requirement: Core entity record
Every module item SHALL be an entity with a stable id, module type, title, optional place, version, creator, updater, channel of creation and last update, and timestamps. Module-specific fields extend the entity without changing the shared shape.

#### Scenario: Uniform reference
- **WHEN** any shared feature (link, tag, comment, reminder, attachment, search) references an item
- **THEN** it uses only the entity id, independent of the module

#### Scenario: Validated module fields
- **WHEN** an entity is created or updated with module fields that fail that module's schema
- **THEN** the system rejects the write with field-level validation errors and stores nothing

### Requirement: Concurrent edit protection
An update SHALL accept the version of the entity it was based on. If the entity changed since that version, the system MUST reject the update with a conflict error that includes the current version, and MUST leave the entity unchanged. An update without a version MUST be applied as given.

#### Scenario: Stale edit rejected
- **WHEN** two members open the same entity, the first saves a title change, and the second then saves a change based on the old version
- **THEN** the second save is rejected with a conflict and the first member's title remains

#### Scenario: Unversioned API update
- **WHEN** an API client updates an entity without sending a version
- **THEN** the update is applied

### Requirement: Archive and trash
Entities SHALL support archive (hidden from default lists, restorable) and delete (moved to trash). Trashed entities MUST be restorable for 30 days and then permanently purged with their dependent shared records.

#### Scenario: Delete and restore
- **WHEN** a member deletes an entity and restores it within 30 days
- **THEN** the entity and its tags, links, comments, reminders, and attachments are back unchanged

#### Scenario: Purge
- **WHEN** a trashed entity is older than 30 days
- **THEN** the system permanently removes it and its attachment files

#### Scenario: Hidden from lists
- **WHEN** a list, search, Today, or API list runs without an explicit archived/trash filter
- **THEN** archived and trashed entities are excluded

#### Scenario: Trashed counterpart hidden
- **WHEN** entity B is trashed
- **THEN** links to B, pins of B, and inbox items about B are hidden until B is restored

### Requirement: Module registry
Every module SHALL be declared by one definition that states its type key, labels, icon, field schema, list columns, filters, sortable fields, detail sections, place rule, which shared features it enables, and how it summarizes itself for search, Today, and API clients. Navigation, create flows, lists, detail pages, search, and API endpoints MUST be derived from these definitions.

#### Scenario: New module appears everywhere
- **WHEN** a developer registers a new module definition and its migration
- **THEN** it appears in navigation, quick-create, search, the API, and the API document without editing those features

#### Scenario: Disabled shared feature
- **WHEN** a module does not enable a shared feature (for example attachments)
- **THEN** that feature is absent from its UI and the API rejects such requests for its entities as forbidden
