import { cn } from "@/lib/utils";
// DESIGN.md text-input: surface-1, 8px corners, 8px 12px padding; focus ring from the base layer.
export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-[8px] border border-hairline bg-surface-1 px-3 text-[15px] text-ink placeholder:text-ink-tertiary focus-visible:border-hairline-strong disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
