"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UnreadBadge } from "@/components/unread-badge";

/** `unread`: a polled count shown beside the label (announcements). */
export type NavItem = { href: string; label: string; unread?: { endpoint: string; initial: number } };

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {items.map((item) => {
        const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-primary/10 text-primary" : "text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            {item.label}
            {item.unread && <UnreadBadge endpoint={item.unread.endpoint} initial={item.unread.initial} refreshUnder={item.href} />}
          </Link>
        );
      })}
    </nav>
  );
}
