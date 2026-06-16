"use client";

import * as Popover from "@radix-ui/react-popover";
import { useCallback, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";

export interface MentionUser {
  id: string;
  username: string;
  displayName: string | null;
}

export interface MentionTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  name?: string;
  users?: MentionUser[];
}

type MentionState = {
  query: string;
  start: number;
  end: number;
} | null;

function displayNameKey(displayName: string): string {
  return displayName.toLowerCase().replace(/\s+/g, "_");
}

function findActiveMention(value: string, cursor: number): MentionState {
  const beforeCursor = value.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }

  const query = beforeCursor.slice(atIndex + 1);
  if (/\s/.test(query)) {
    return null;
  }

  return { query, start: atIndex, end: cursor };
}

export function MentionTextarea({
  className = "",
  users = [],
  value,
  defaultValue,
  onChange,
  onKeyDown,
  ...props
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [internalValue, setInternalValue] = useState(
    () => (defaultValue as string | undefined) ?? "",
  );
  const [mentionState, setMentionState] = useState<MentionState>(null);
  const [open, setOpen] = useState(false);

  const currentValue = value !== undefined ? String(value) : internalValue;

  const filteredUsers = useMemo(() => {
    if (!mentionState) {
      return [];
    }

    const query = mentionState.query.toLowerCase();
    return users
      .filter((user) => {
        if (!query) {
          return true;
        }
        const usernameMatch = user.username.toLowerCase().includes(query);
        const displayMatch = user.displayName
          ? displayNameKey(user.displayName).includes(query) ||
            user.displayName.toLowerCase().includes(query)
          : false;
        return usernameMatch || displayMatch;
      })
      .slice(0, 8);
  }, [mentionState, users]);

  const syncMentionState = useCallback(
    (nextValue: string, cursor: number) => {
      const active = findActiveMention(nextValue, cursor);
      setMentionState(active);
      setOpen(Boolean(active && users.length > 0));
    },
    [users.length],
  );

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (value === undefined) {
      setInternalValue(event.target.value);
    }
    syncMentionState(event.target.value, event.target.selectionStart ?? event.target.value.length);
    onChange?.(event);
  };

  const insertMention = (user: MentionUser) => {
    const textarea = textareaRef.current;
    if (!textarea || !mentionState) {
      return;
    }

    const mentionText = `@${user.username}`;
    const nextValue =
      currentValue.slice(0, mentionState.start) +
      mentionText +
      " " +
      currentValue.slice(mentionState.end);

    if (value === undefined) {
      setInternalValue(nextValue);
    }

    const cursor = mentionState.start + mentionText.length + 1;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });

    setMentionState(null);
    setOpen(false);

    if (onChange) {
      const syntheticEvent = {
        ...({} as React.ChangeEvent<HTMLTextAreaElement>),
        target: { ...textarea, value: nextValue },
        currentTarget: { ...textarea, value: nextValue },
      };
      onChange(syntheticEvent);
    }
  };

  return (
    <Popover.Root open={open && filteredUsers.length > 0} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <textarea
          ref={textareaRef}
          className={`w-full rounded-md border border-border bg-background px-3 py-2 text-base leading-relaxed focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${className}`}
          value={currentValue}
          onChange={handleChange}
          onKeyDown={(event) => {
            if (open && event.key === "Escape") {
              setOpen(false);
            }
            onKeyDown?.(event);
          }}
          onClick={(event) => {
            syncMentionState(
              event.currentTarget.value,
              event.currentTarget.selectionStart ?? event.currentTarget.value.length,
            );
          }}
          onKeyUp={(event) => {
            syncMentionState(
              event.currentTarget.value,
              event.currentTarget.selectionStart ?? event.currentTarget.value.length,
            );
          }}
          {...props}
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="z-50 max-h-48 w-56 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-card"
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <ul role="listbox" aria-label="Mention suggestions">
            {filteredUsers.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full cursor-pointer flex-col rounded-sm px-3 py-2 text-left text-sm hover:bg-accent-soft"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(user);
                  }}
                >
                  <span className="font-medium text-text">@{user.username}</span>
                  {user.displayName ? (
                    <span className="text-xs text-text-muted">{user.displayName}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
