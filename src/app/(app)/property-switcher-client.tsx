"use client";

/**
 * Property scope switcher (task 7.4, design D7).
 *
 * A header select that sets the user's global property scope. Choosing a
 * property scopes lists, Today, search and the due feed; "All" clears it.
 * The choice persists per user in `user_preferences.property_scope`.
 *
 * After a change, `invoke` triggers `refresh()` so scoped Server Components
 * (lists/places/rollups) re-render in the same round trip.
 */

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invoke } from "@/lib/actions/invoke";

interface PropertyOption {
  id: string;
  title: string;
}

interface PropertySwitcherClientProps {
  properties: PropertyOption[];
  currentScope: string | null;
}

export function PropertySwitcherClient({
  properties,
  currentScope,
}: PropertySwitcherClientProps) {
  const [scope, setScope] = useState<string>(currentScope ?? "__all__");
  const [, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const next = value === "__all__" ? null : value;
    setScope(value);
    startTransition(async () => {
      await invoke("updatePreferences", { propertyScope: next });
    });
  };

  if (properties.length === 0) {
    return null;
  }

  return (
    <Select value={scope} onValueChange={handleChange}>
      <SelectTrigger className="w-44" data-testid="property-scope-switcher">
        <SelectValue placeholder="All properties" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All properties</SelectItem>
        {properties.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
