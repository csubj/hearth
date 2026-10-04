## Purpose

Guarantees that every operation behaves the same whether called from the web UI, the REST API, or a future MCP client, with consistent validation, errors, limits, safe retries, and attribution of who (and what tool) made each change.

## ADDED Requirements

### Requirement: Single operation contract
Every read and write SHALL be defined once with a validated input schema and output shape. Web pages, web forms, the REST API, and future MCP tools MUST call the same operations and get the same validation and authorization results.

#### Scenario: Same validation everywhere
- **WHEN** the same invalid input is sent through the web form and the REST API
- **THEN** both reject it with the same error code and field errors

### Requirement: Actor attribution
Every write SHALL record the acting user and the channel: `web` or the name of the API key used. The recorded key name MUST be the name at the time of the write; renaming or revoking the key later MUST NOT change past records.

#### Scenario: Agent write
- **WHEN** user CJ's API key named "Claude" creates an entity
- **THEN** the entity and its activity entry show "CJ via Claude"

#### Scenario: Key renamed later
- **WHEN** the key "Claude" is renamed to "Assistant" after that write
- **THEN** the earlier activity entry still shows "CJ via Claude"

### Requirement: REST API
The system SHALL expose JSON endpoints under `/api/v1` for every registered module and every shared feature (tags, links, URLs, attachments, notes, comments, assignees, reminders, activity and undo, inbox, places, search), authenticated only by `Authorization: Bearer <api key>`. Lists MUST use cursor pagination with `limit` (1–100, default 50) and return `{ data, nextCursor }`.

#### Scenario: Paginated list
- **WHEN** a client lists entities with `limit=2` and more exist
- **THEN** the response contains 2 items and a non-null `nextCursor` that returns the next items

#### Scenario: Missing token
- **WHEN** a request to `/api/v1` has no valid bearer key
- **THEN** the response is 401 with the standard error body

#### Scenario: Cookie is not enough
- **WHEN** a request to `/api/v1` carries a valid session cookie but no bearer key
- **THEN** the response is 401

### Requirement: Idempotent creation
REST requests that create data SHALL accept an `Idempotency-Key` header. Repeating a request with the same key and the same body within 24 hours MUST return the original response without writing again. Reusing a key with a different body MUST be rejected as a conflict.

#### Scenario: Retry after timeout
- **WHEN** an agent creates an entity with an idempotency key, loses the response, and sends the identical request again
- **THEN** exactly one entity exists and both responses carry the same entity

#### Scenario: Key reused for different content
- **WHEN** a client reuses an idempotency key with a different body
- **THEN** the response is 409 and nothing is written

### Requirement: Self-describing API
The system SHALL publish an OpenAPI document generated from the same schemas the operations use, with concrete field-level schemas and the error body, and render human-readable docs.

#### Scenario: Schema matches behavior
- **WHEN** a module field is added to its schema
- **THEN** the OpenAPI document includes that field without separate edits

### Requirement: Error model
Errors SHALL use the body `{ error: { code, message, details?, requestId } }` with codes `validation_error` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `rate_limited` (429), `internal_error` (500). Internal errors MUST NOT expose internal details; their `requestId` MUST match the server log entry.

#### Scenario: Validation error details
- **WHEN** input fails validation
- **THEN** the response is 400 with `details` listing each dot-separated `path` and `message`

#### Scenario: Internal error
- **WHEN** an unexpected failure occurs
- **THEN** the response is 500 with a generic message and a `requestId` that appears in the server log with the full error

### Requirement: Bounded input
The system SHALL enforce maximum sizes on all inputs: titles 200 characters, comments 20 KB, notes 500 KB, list `limit` 100, and attachment sizes as defined for attachments. Oversized input MUST be rejected with a validation error before it is stored.

#### Scenario: Oversized notes
- **WHEN** a client saves notes larger than 500 KB
- **THEN** the save is rejected with `validation_error` and the stored notes are unchanged
