## Purpose

Controls who can access a hearth instance, how members sign in, how admins manage accounts, and how API keys grant programmatic access on behalf of a user.

## ADDED Requirements

### Requirement: Username and password sign-in
The system SHALL authenticate members by username and password and keep them signed in with a session cookie lasting 30 days. Passwords MUST be 8–128 characters and stored only as a strong one-way hash. Usernames MUST NOT change after the account is created.

#### Scenario: Successful sign-in
- **WHEN** an active member submits a correct username and password
- **THEN** the system creates a session, sets an httpOnly cookie, and redirects to the sanitized `returnTo` path or `/`

#### Scenario: Wrong credentials
- **WHEN** a sign-in attempt uses an unknown username or wrong password
- **THEN** the system rejects it with one generic error message that does not reveal which field was wrong

### Requirement: Sign-in rate limiting
The system SHALL count failed sign-in attempts per username and client IP address. After 5 failed attempts for the same pair within 15 minutes, further attempts for that pair MUST be rejected with a rate-limited error until the window passes. A successful sign-in MUST reset the count for that pair. Failures from one IP address MUST NOT block the same username from another IP address.

#### Scenario: Repeated failures are rate limited
- **WHEN** a sixth attempt follows 5 failed attempts for the same username and IP within 15 minutes
- **THEN** the system rejects it as rate limited, even if the password is correct

#### Scenario: Other address not blocked
- **WHEN** a username is rate limited from one IP address and the member signs in from a different IP address
- **THEN** the sign-in is evaluated normally

#### Scenario: Success resets the count
- **WHEN** a member fails 4 times and then signs in successfully
- **THEN** the failure count for that username and IP returns to zero

### Requirement: No self-registration
The system SHALL NOT offer self-service sign-up. Accounts MUST be created by an admin or by the first-run bootstrap command.

#### Scenario: Bootstrap first admin
- **WHEN** the bootstrap command runs on an instance with no users
- **THEN** it creates one admin user

#### Scenario: Bootstrap refuses when users exist
- **WHEN** the bootstrap command runs and any user already exists
- **THEN** it exits with an error and changes nothing

#### Scenario: Sign-up endpoint closed
- **WHEN** a client calls any sign-up or account-administration endpoint of the authentication library directly
- **THEN** the system responds 404

### Requirement: Unauthenticated access is blocked
Every app page and API route except sign-in, health, `/api/openapi.json`, and `/api/docs` SHALL require a valid session or API key.

#### Scenario: Anonymous page request
- **WHEN** a request without a valid session opens an app page
- **THEN** the system redirects to `/login?returnTo=<path>`

### Requirement: Admin user management
Instance admins SHALL be able to create users, reset passwords, disable and re-enable users, and promote or demote admins. Users MUST NOT be permanently deleted; disabling replaces deletion. The system MUST prevent disabling or demoting the last active admin.

#### Scenario: Disable a user
- **WHEN** an admin disables a member
- **THEN** that member's sessions and API keys stop working on their next request

#### Scenario: Last admin protected
- **WHEN** an admin tries to demote or disable the only active admin
- **THEN** the system rejects the action with an explanation

### Requirement: Self-service account settings
Members SHALL be able to change their display name, theme, and password. Changing a password MUST require the current password and sign out other sessions.

#### Scenario: Password change
- **WHEN** a member changes their password with the correct current password
- **THEN** all other sessions are revoked and the current device stays signed in

### Requirement: API keys belong to a user
Members SHALL be able to create named API keys that act as themselves. The full key MUST be shown only once at creation; only a hash is stored. Keys can be revoked and show last-used time. Keys MUST NOT be subject to a low per-key request quota.

#### Scenario: Create key
- **WHEN** a member creates a key named "Claude"
- **THEN** the system shows the secret once and later lists the key by name, prefix, and last-used time only

#### Scenario: Revoked key
- **WHEN** a request uses a revoked key or a key of a disabled user
- **THEN** the API responds 401

#### Scenario: Sustained agent use
- **WHEN** a valid key makes 500 requests within one hour
- **THEN** none of them is rejected for exceeding a per-key quota

### Requirement: API keys cannot manage accounts
Requests authenticated by an API key SHALL NOT perform admin user management, API key management, or password changes. Such requests MUST be rejected as forbidden.

#### Scenario: Agent tries to disable a user
- **WHEN** an admin's API key calls the disable-user operation
- **THEN** the response is 403 and the user stays active
