"use client";

import { useState } from "react";

type Props = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function DeferredDetailsSection({ title, defaultOpen = false, children }: Props) {
  const [hasOpened, setHasOpened] = useState(defaultOpen);

  return (
    <details
      className="rounded-md border border-foreground/20 bg-background p-3"
      open={defaultOpen ? true : undefined}
      onToggle={(event) => {
        const el = event.currentTarget;
        if (el.open) setHasOpened(true);
      }}
    >
      <summary className="cursor-pointer select-none text-sm font-semibold">{title}</summary>
      {hasOpened ? <div className="mt-4">{children}</div> : null}
    </details>
  );
}
