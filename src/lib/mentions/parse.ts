export type MentionCandidate = {
  id: string;
  username: string;
  displayName: string | null;
};

const MENTION_PATTERN = /@([a-zA-Z0-9_]+)/g;

function displayNameKey(displayName: string): string {
  return displayName.toLowerCase().replace(/\s+/g, "_");
}

function buildLookup(users: MentionCandidate[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const user of users) {
    lookup.set(user.username.toLowerCase(), user.id);
    if (user.displayName) {
      lookup.set(displayNameKey(user.displayName), user.id);
    }
  }

  return lookup;
}

/** Parse @-mentions from body text; returns deduped user ids for known active users. */
export function parseMentions(body: string, activeUsers: MentionCandidate[]): string[] {
  const lookup = buildLookup(activeUsers);
  const mentioned = new Set<string>();

  for (const match of body.matchAll(MENTION_PATTERN)) {
    const key = match[1]!.toLowerCase();
    const userId = lookup.get(key);
    if (userId) {
      mentioned.add(userId);
    }
  }

  return [...mentioned];
}
