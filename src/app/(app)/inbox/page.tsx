/**
 * Inbox page (task 10.3, design D8).
 *
 * A Server Component that loads the current member's open attention items
 * through the server-only router client and renders the interactive list.
 */

import { serverClient } from "@/lib/orpc-server-client";
import { InboxClient, type InboxItem } from "./inbox-client";

export default async function InboxPage() {
  let items: InboxItem[] = [];
  try {
    const result = await serverClient.listInbox({ limit: 100 });
    items = (result as { data: InboxItem[] }).data;
  } catch {
    items = [];
  }

  return <InboxClient items={items} />;
}
