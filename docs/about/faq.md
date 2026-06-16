# FAQ

Frequently asked questions about hearth.

## General

### What is hearth?

A self-hosted web app for household coordination — shared notes, restaurants, projects, trackers, and events. Think kitchen whiteboard, not corporate task manager.

### Who is it for?

Small households: partners, roommates, families. One deployment serves one household.

### Is it free?

Yes. hearth is open source under the [MIT License](license.md).

### Do I need an account with a third-party service?

No. hearth is self-hosted. You run it on your own server or machine. No OAuth, no external identity provider.

## Users & access

### Can people sign up themselves?

No. The instance admin creates accounts. There is no self-service registration.

### Can I have private notes?

No. Everything in hearth is shared with all household members by design.

### What if I forget my password?

Ask your admin to reset it. There is no email-based password reset.

### Can I have read-only access for guests?

Not in v1. Every authenticated user can read and write all household data.

### Can one instance serve multiple households?

No. One instance = one household. Run separate instances for separate households.

## Features

### Does hearth send push notifications or email?

No. v1 has an in-app notification feed only. See the [roadmap](roadmap.md).

### Is there a mobile app?

No native app. The responsive web UI works on phones and tablets.

### Can I sync with Google Calendar?

Not in v1. Events are managed within hearth.

### Is there a map for restaurants?

Not yet. Restaurants are a list in v1. Map view is on the [roadmap](roadmap.md).

### Does hearth support dark mode?

Not in v1. CSS variables are structured to add it later.

## Technical

### Why SQLite?

Embedded, zero-config, file-backed. Perfect for a single-household app with one writer. No separate database server.

### Can I run multiple replicas for high availability?

No. SQLite supports one writer. Run one instance per household and scale vertically.

### Where are photos stored?

On disk in `data/uploads/`, alongside the database. Include both in backups.

### What Node version do I need?

Node.js 22 LTS for development. The Docker image bundles the runtime.

### How do I report a bug?

Open an issue on [GitHub](https://github.com/csubj/hearth/issues) with steps to reproduce, your deploy method, and relevant logs.

## Deployment

### What's the easiest way to run hearth?

[Docker quickstart](../getting-started/docker-quickstart.md) — pull the GHCR image and run with Compose.

### Do I need HTTPS?

Strongly recommended for production. Session cookies use the `Secure` flag when `NODE_ENV=production`.

### How do I back up my data?

Archive the `data/` directory. See [Backup & restore](../operations/backup-restore.md).

### How do I upgrade?

Pull a new image or git tag, restart, migrations run automatically. See [Upgrading](../operations/upgrading.md).
