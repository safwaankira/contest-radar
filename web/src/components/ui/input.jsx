import { cn } from "@/lib/utils";
export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-[var(--radius)] border border-border bg-background px-3 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
