## Purpose

Provides one consistent way to label, relate, and attach files to any item, replacing the per-module tag, link, and attachment systems of the old app.

## ADDED Requirements

### Requirement: Household tags
Tags SHALL be shared across all modules, matched case-insensitively, and creatable inline while tagging. Lists MUST be filterable by tag.

#### Scenario: Shared tag
- **WHEN** an inventory item and a project are both tagged "kitchen"
- **THEN** filtering by "kitchen" in search returns both

#### Scenario: Case-insensitive match
- **WHEN** a member tags an entity "Kitchen" and the tag "kitchen" already exists
- **THEN** the existing tag is used and no second tag is created

### Requirement: Entity links
Members SHALL be able to link any two entities with a relation from a fixed set (`related`, `part_of`, `uses`, `fixes`, `replaces`). Links MUST be visible from both sides with a direction-appropriate label. `related` MUST be symmetric.

#### Scenario: Two-sided link
- **WHEN** a maintenance record is linked to an item with relation `fixes`
- **THEN** the record shows "fixes <item>" and the item shows "fixed by <record>"

#### Scenario: Duplicate link
- **WHEN** the same pair and relation are linked twice
- **THEN** the system keeps one link and reports a conflict

#### Scenario: Symmetric duplicate
- **WHEN** A is `related` to B and a member links B `related` to A
- **THEN** the system keeps one link and reports a conflict

### Requirement: External URLs
Entities SHALL support a list of labeled external URLs.

#### Scenario: Add URL
- **WHEN** a member adds a labeled URL
- **THEN** it renders as a link opening in a new tab

### Requirement: Attachments
Entities of modules that enable attachments SHALL accept images (JPEG, PNG, WebP, GIF) up to 10 MB and, where the module allows documents, PDFs up to 25 MB. File type MUST be verified from content, not only the name. Files MUST only be served to authenticated members or API keys. A failed upload MUST leave no stored file or record. Removed attachments MUST be restorable for 30 days.

#### Scenario: Spoofed file
- **WHEN** a file named `photo.jpg` contains non-image bytes
- **THEN** the upload is rejected with a validation error

#### Scenario: Large document intact
- **WHEN** a member uploads a 24 MB PDF to a module that allows documents
- **THEN** downloading it returns a byte-identical file

#### Scenario: Private file
- **WHEN** an unauthenticated request asks for an attachment URL
- **THEN** the response is 401 and no bytes are sent

#### Scenario: Image preview
- **WHEN** an image is attached
- **THEN** the detail page shows a gallery of reduced-size thumbnails and opens the full-size image in a viewer
