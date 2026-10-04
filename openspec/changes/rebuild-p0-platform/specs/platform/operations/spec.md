## Purpose

Keeps a self-hosted instance's data safe and its health visible: automatic backups, safe upgrades, a health check, isolated maintenance jobs, clean shutdown, and predictable performance at household scale.

## ADDED Requirements

### Requirement: Automatic backups
The system SHALL create a consistent backup of its database once per day while running, without stopping the app. Each backup MUST be verified for integrity after it is written. The system MUST keep the 7 most recent daily backups and 4 weekly backups and delete older ones.

#### Scenario: Daily backup
- **WHEN** the instance has been running for a day
- **THEN** a new backup file exists in the backups directory and opens as a valid database that passes an integrity check

#### Scenario: Retention
- **WHEN** an eighth daily backup is written
- **THEN** the oldest daily backup that is not also a kept weekly backup is deleted

#### Scenario: Restore
- **WHEN** an operator restores a backup with the documented command while the app is stopped and then starts the app
- **THEN** the app serves the data as it was at backup time

### Requirement: Safe upgrades
On start, the system SHALL apply pending database migrations only after writing a backup of the current database. If a migration fails, the system MUST NOT serve requests and MUST exit with an error that names the backup to restore.

#### Scenario: Upgrade with pending migrations
- **WHEN** a new version starts against a database with pending migrations
- **THEN** a pre-migration backup is written before any migration runs

#### Scenario: Failed migration
- **WHEN** a migration fails during start
- **THEN** the process exits with an error naming the pre-migration backup, and no request is served

### Requirement: Health check
The system SHALL expose a public health endpoint that returns 200 when the database answers and scheduled processing has run within the last 15 minutes, and 503 naming the failing check otherwise. The response MUST NOT contain household data.

#### Scenario: Scheduler stalled
- **WHEN** scheduled processing has not run for 20 minutes
- **THEN** the health endpoint returns 503 and names the scheduler check

### Requirement: Maintenance jobs
Scheduled maintenance (reminders, trash purge, backups, index and file consistency checks, cleanup of expired data) SHALL run without user activity. A failure in one job MUST NOT prevent the other jobs from running. Daily jobs missed while the instance was stopped MUST run soon after it starts.

#### Scenario: One job fails
- **WHEN** the backup job fails because the disk is full
- **THEN** reminders are still processed, the failure is logged, and the health endpoint reports it

### Requirement: Clean shutdown
On a stop signal the system SHALL stop starting new scheduled work, finish work in progress, and close the database cleanly.

#### Scenario: Stop during processing
- **WHEN** the instance receives a stop signal while scheduled processing runs
- **THEN** processing finishes before the process exits and no write is lost

### Requirement: Performance at household scale
With a dataset of 10,000 entities, 500 places, 50,000 activity entries, 2,000 reminders, and 5,000 comments, the system SHALL produce list, detail, and search results within 100 ms and the Today page data within 200 ms of server time (95th percentile on a laptop-class machine). No list, search, Today, inbox, or due-feed query MUST require a full scan of entities, activity, or attention records.

#### Scenario: Large household list
- **WHEN** a member opens a module list on the reference dataset
- **THEN** the server produces the first page within 100 ms
