"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useToast } from "@/components/ui/ToastProvider";

export function FlashToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  useEffect(() => {
    const error = searchParams.get("error");
    const message = searchParams.get("toast");

    if (!error && !message) {
      return;
    }

    if (error) {
      toast(error, "error");
    } else if (message) {
      toast(message, "success");
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    params.delete("toast");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams, toast]);

  return null;
}
