## Purpose

Lets members be reminded about anything in hearth — on a repeating interval or a single date — through one reminder system shared by every module.

## ADDED Requirements

### Requirement: Reminders on any entity
Any entity of a module that enables reminders SHALL support zero or more reminders. Each reminder MUST have a title and is either interval-based (count + unit of day, week, month, or year) or one-time (due date). Due dates are calendar dates evaluated in the instance's configured time zone. Adding months or years to a date that does not exist in the target month MUST give the last day of that month.

#### Scenario: Interval reminder due date
- **WHEN** an interval reminder of 3 months was last completed on Jan 10
- **THEN** its next due date is Apr 10

#### Scenario: Month end
- **WHEN** a monthly reminder is completed on Jan 31
- **THEN** its next due date is the last day of February

#### Scenario: First due date
- **WHEN** a member creates an interval reminder without choosing a first due date
- **THEN** its first due date is the creation date plus one interval, and the member may choose a different first due date instead

### Requirement: Recipient resolution
A reminder SHALL notify its own recipients if set; otherwise the entity's assignees; otherwise all members. Only active members MUST be notified.

#### Scenario: Falls back to assignees
- **WHEN** a reminder has no recipients and its entity is assigned to Sam
- **THEN** only Sam is notified when it comes due

#### Scenario: Disabled recipient skipped
- **WHEN** a reminder's only recipient has been disabled
- **THEN** that user is not notified

### Requirement: Completion
Completing a reminder SHALL record who completed it and when. Interval reminders MUST reschedule from the completion date; one-time reminders MUST close. Completion MUST clear that reminder's open inbox items for all members.

#### Scenario: Complete interval
- **WHEN** a member completes a weekly reminder
- **THEN** its next due date is one week after the completion date and the completion appears in activity

### Requirement: Paused reminders
Reminders of archived or trashed entities SHALL NOT notify and MUST NOT appear in due feeds. They MUST resume when the entity is unarchived or restored.

#### Scenario: Archived entity
- **WHEN** an entity with an overdue reminder is archived
- **THEN** the reminder disappears from due feeds and creates no new inbox items until the entity is unarchived

### Requirement: Scheduled processing
The system SHALL evaluate reminders on a schedule (at least every 15 minutes) independent of page views, and MUST create at most one attention item per recipient per due date. Reminders that came due while the system was not running MUST be processed when it starts.

#### Scenario: No duplicate alerts
- **WHEN** the scheduler runs several times while a reminder stays overdue
- **THEN** each recipient has only one attention item for that due date

#### Scenario: Catch up after downtime
- **WHEN** a reminder came due while the instance was stopped
- **THEN** its recipients get their attention items shortly after the instance starts

### Requirement: Due feed
The system SHALL list, for the current member, the reminders whose resolved recipients include them and that are overdue or due within a window (default 14 days), sorted overdue first, then by due date, respecting the property scope.

#### Scenario: Overdue first
- **WHEN** one reminder is 2 days overdue and another is due tomorrow
- **THEN** the overdue one is listed first

#### Scenario: Someone else's reminder
- **WHEN** a reminder's only recipient is Sam
- **THEN** it appears in Sam's due feed and not in CJ's, while it stays visible to everyone on the entity's detail page
