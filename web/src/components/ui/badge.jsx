import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// DESIGN.md status-badge: surface-2, ink-muted, 12px caption, pill, 2px 8px.
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] leading-[1.4]", {
  variants: {
    variant: {
      default: "bg-surface-2 text-ink-muted",
      outline: "border border-hairline text-ink-subtle",
      success: "bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[#5fd17a]",
      urgent: "bg-[color-mix(in_srgb,var(--urgent)_14%,transparent)] text-[#ff8a8a]",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
