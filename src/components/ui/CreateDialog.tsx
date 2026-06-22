"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/ToastProvider";

type CreateDialogContextValue = {
  /**
   * Called by the form when its server action reports success. Closes the
   * dialog, shows a toast, and refreshes the current route so the new item
   * appears in the list without a navigation.
   */
  onSuccess: (message?: string) => void;
};

const CreateDialogContext = createContext<CreateDialogContextValue | null>(null);

export function useCreateDialog(): CreateDialogContextValue {
  const context = useContext(CreateDialogContext);
  if (!context) {
    throw new Error("useCreateDialog must be used within a CreateDialog");
  }
  return context;
}

/**
 * Fires the enclosing CreateDialog's onSuccess exactly once each time `active`
 * transitions to true. Safe to call from forms that may also render outside a
 * dialog: when there is no CreateDialog context this is a no-op.
 */
export function useCreateDialogSuccess(active: boolean, message?: string): void {
  const context = useContext(CreateDialogContext);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!context) return;
    if (active && !handledRef.current) {
      handledRef.current = true;
      context.onSuccess(message);
    } else if (!active) {
      handledRef.current = false;
    }
  }, [active, message, context]);
}

export function CreateDialog({
  triggerLabel,
  triggerVariant = "primary",
  triggerClassName,
  title,
  description,
  successMessage,
  closeOnSuccess = true,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  triggerClassName?: string;
  title: string;
  description?: string;
  successMessage?: string;
  /**
   * When false, the dialog stays open on success (e.g. to display a one-time
   * secret). It still toasts and refreshes the route.
   */
  closeOnSuccess?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const onSuccess = useCallback(
    (message?: string) => {
      const text = message ?? successMessage;
      if (text) {
        toast(text, "success");
      }
      router.refresh();
      if (closeOnSuccess) {
        setOpen(false);
      }
    },
    [closeOnSuccess, router, successMessage, toast],
  );

  const value = useMemo<CreateDialogContextValue>(() => ({ onSuccess }), [onSuccess]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader title={title} description={description} />
        <DialogBody>
          <CreateDialogContext.Provider value={value}>{children}</CreateDialogContext.Provider>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
