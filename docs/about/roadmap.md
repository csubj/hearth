# Roadmap

Items explicitly **out of scope for v1** that may come later. Nothing here is committed — priorities may change based on household needs and contributor interest.

## Near-term candidates

| Feature | Notes |
| ------- | ----- |
| Google Maps for restaurants | Browse by pin, plan outings by proximity (free tier) |
| Push notifications | Mobile/web push for @-mentions and activity |
| Email digests | Weekly summary of household activity |
| Dark mode | CSS variables already structured for it |
| Thumbnail generation | `sharp`-based thumbs on upload for faster grids |
| Scoped API tokens | Per-resource permissions instead of full household access |

## Longer-term ideas

| Feature | Notes |
| ------- | ----- |
| Guest / read-only access | View without edit for visitors |
| Calendar integrations | Sync events with Google Calendar, iCal |
| SMS reminders | Event reminders via Twilio or similar |
| Multi-household per instance | Unlikely — conflicts with core "one instance = one household" model |
| Mobile-native apps | Responsive web may be sufficient |
| Smart home integrations | Display on e-ink dashboards, Home Assistant |
| Automated deploy pipelines | CI deploy to Fly/Railway on tag push |

## Completed (v1 MVP)

Phases 0–7 from [MVP Phases](../design/08_mvp.md):

- [x] Scaffold, toolchain, Docker
- [x] Authentication and admin user management
- [x] Home page and stream
- [x] Restaurants (list, no map)
- [x] Projects, events, metrics
- [x] Photo attachments
- [x] Notifications and @-mentions
- [x] Polish, CI, smoke tests, documentation

## In progress / upcoming

Phases 8–10 from [MVP Phases](../design/08_mvp.md):

- [ ] Configurable auth (`AUTH_MODE`) and API tokens
- [ ] REST API (`/api/v1/*`) with OpenAPI spec and interactive docs
- [ ] Metrics graphing (Recharts) and existing-data-first page layout
- [ ] Inventory — searchable catalog with tags, links, documents, import/export

## Contributing to the roadmap

Have an idea? Open a [GitHub Discussion](https://github.com/csubj/hearth/discussions) or issue. For implementation, see [Contributing](../contributing.md).

Prefer features that fit hearth's design principles: glanceable, low friction, shared, gentle structure, feels like home.
