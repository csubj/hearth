"use client";

import { Dialog, DialogContent, DialogTrigger, DialogHeader } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useState } from "react";

interface ConfirmDialogProps {
  title: string;
  description: string;
  children?: React.ReactNode;
  onConfirm: () => void;
  confirming?: boolean;
  trigger?: React.ReactNode;
}

/**
 * A reusable confirmation dialog. Opens on trigger click, shows the dialog body
 * with a confirm and cancel button. Calls onConfirm when confirmed.
 */
export function ConfirmDialog({
  title,
  description,
  children,
  onConfirm,
  confirming = false,
  trigger,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          >
            Delete
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader title={title} />
        <div className="px-5 py-4">
          <div className="mb-3 text-sm text-text-muted">{description}</div>
          {children ? <div className="mb-4 space-y-1">{children}</div> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={confirming}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
              disabled={confirming}
              className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            >
              {confirming ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
