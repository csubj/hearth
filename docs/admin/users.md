# User management

Admin-only user management at `/admin/users`. Only users with the **admin** role can access this page.

## Roles

| Role | Capabilities |
| ---- | ------------ |
| **Member** | Log in, read/write all household data, change own password |
| **Admin** | Everything a member can do, plus create/disable users, reset passwords, promote to admin |

There is no read-only or guest role. Every authenticated user has full access to shared household data.

!!! warning "Last admin protection"
    At least one active admin must always exist. The UI blocks disabling or demoting the last admin.

## List users

The admin panel shows all users with:

- Username
- Display name
- Role (member / admin)
- Active or disabled status
- Last login (if tracked)

## Create a user

1. Go to **Admin** → **Users**
2. Click **Create user**
3. Provide:
   - **Username** — unique within the instance
   - **Initial password** — share with the household member out of band
   - **Display name** — optional; used for @-mentions
   - **Role** — defaults to member

There are no invitation emails. Copy credentials via text, in person, or your household's preferred channel.

## Reset a password

Set a new password for any user:

1. Select the user in the admin panel
2. Choose **Reset password**
3. Enter the new password

Resetting a password **invalidates all active sessions** for that user. They must log in again with the new password.

## Disable and re-enable

**Disable** — soft-disable: the user cannot log in, but historical attribution (who created what) is preserved.

**Re-enable** — restores login access.

Disabling a user also invalidates their sessions immediately.

## Promote to admin

Grant admin role to an existing member. Promotion is idempotent — promoting an admin again has no effect.

You cannot demote yourself if you are the **last admin**.

## Audit trail

Admin actions (create user, reset password, disable user) appear in the notification stream for other admins as household-visible audit events.

## Bootstrap vs. admin UI

The **first admin** is created via CLI (`pnpm run auth:bootstrap`), not the web UI. After bootstrap, all user management goes through this admin panel.

See [First use guide](../getting-started/first-use.md) for initial setup.

## Security notes

- Never share password hashes or session details
- Use strong passwords for admin accounts
- Remove or disable accounts when someone leaves the household
