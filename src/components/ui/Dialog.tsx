"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type ComponentPropsWithoutRef } from "react";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        className={`fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-surface shadow-card focus:outline-none ${className}`}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <DialogTitle className="font-serif text-lg text-text">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="mt-1 text-sm text-text-muted">
            {description}
          </DialogDescription>
        ) : null}
      </div>
      <DialogClose className="-mr-1 shrink-0 rounded-md px-2 py-1 text-sm text-text-muted hover:bg-accent-soft hover:text-text">
        Close
      </DialogClose>
    </div>
  );
}

export function DialogBody({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`overflow-y-auto px-5 py-4 ${className}`}>{children}</div>;
}
