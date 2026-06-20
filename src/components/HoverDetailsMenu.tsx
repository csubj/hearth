"use client";

import { useRef, type ReactNode } from "react";

type HoverDetailsMenuProps = {
  className?: string;
  summaryClassName?: string;
  panelClassName: string;
  panelAlign?: "left" | "right";
  summary: ReactNode;
  children: ReactNode;
};

const defaultSummaryClassName =
  "inline-flex cursor-pointer list-none items-center rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&::-webkit-details-marker]:hidden";

export function HoverDetailsMenu({
  className,
  summaryClassName = defaultSummaryClassName,
  panelClassName,
  panelAlign = "left",
  summary,
  children,
}: HoverDetailsMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const openMenu = () => {
    if (detailsRef.current) detailsRef.current.open = true;
  };

  const closeMenu = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  const handleSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      e.preventDefault();
    }
  };

  return (
    <details
      ref={detailsRef}
      className={className}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      <summary className={summaryClassName} onClick={handleSummaryClick}>
        {summary}
      </summary>
      <div
        className={`absolute top-full z-50 pt-1 ${panelAlign === "right" ? "right-0" : "left-0"}`}
      >
        <div className={panelClassName}>{children}</div>
      </div>
    </details>
  );
}
