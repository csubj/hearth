## Purpose

Shows the household what changed and who changed it, lets members undo recent changes (including those made by AI agents), and separates quiet activity from items that need a specific member's attention.

## ADDED Requirements

### Requirement: Activity log
Every entity write SHALL record an activity entry with actor, channel, action, entity, time, and what changed. Consecutive updates by the same actor and channel to the same entity within 5 minutes MUST be combined into one entry that shows the values before the first and after the last update.

#### Scenario: Agent change visible
- **WHEN** an API key named "Claude" updates three entities
- **THEN** the activity feed shows each update attributed "CJ via Claude" with what changed

#### Scenario: Editing session combined
- **WHEN** a member changes a title three times within two minutes
- **THEN** the feed shows one entry from the original title to the final title

### Requirement: Undo
Any active member SHALL be able to undo these actions from their activity entry: create, update (including notes edits), archive, delete, tag, assignee, and link changes, attachment removal, and reminder completion. Undo MUST be refused when the affected values no longer hold what that change produced. Undo MUST itself be recorded as activity and MUST NOT itself be undoable.

#### Scenario: Undo an update
- **WHEN** a member undoes an update that changed a title
- **THEN** the title reverts and a new activity entry records the undo

#### Scenario: Conflicting undo
- **WHEN** a later change set the same field to a different value
- **THEN** undo is refused with an explanation

#### Scenario: Undo a tag among other tag changes
- **WHEN** a member undoes adding the tag "kitchen" after someone else added the tag "paint"
- **THEN** "kitchen" is removed and "paint" stays

#### Scenario: Undo a delete
- **WHEN** a member undoes a delete from its activity entry or the toast
- **THEN** the entity is restored from trash

### Requirement: Activity does not notify
Activity entries SHALL NOT produce attention items or increase the bell count.

#### Scenario: Ordinary edit
- **WHEN** a member edits an entity without mentioning or assigning anyone
- **THEN** no other member's bell count changes

### Requirement: Attention inbox
Each member SHALL have an inbox of attention items created only by mentions of them, assignment to them, and reminders due for them. The bell MUST show the unread count (capped display at 9+). Members can mark items read, mark all read, and dismiss. Items about trashed entities MUST be hidden, and reminder items MUST leave the inbox when the reminder is completed.

#### Scenario: Open item
- **WHEN** a member opens an inbox item
- **THEN** it is marked read and the app navigates to the related entity or comment

#### Scenario: Reminder completed elsewhere
- **WHEN** Sam completes a reminder that also created an inbox item for CJ
- **THEN** that item leaves CJ's inbox and bell count
