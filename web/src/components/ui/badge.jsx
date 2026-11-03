import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[11px] leading-none lowercase", {
  variants: {
    variant: {
      default: "border-border text-muted-foreground",
      primary: "border-primary/40 text-primary",
      accent: "border-transparent bg-accent text-accent-foreground",
      danger: "border-destructive/40 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), "rounded-[calc(var(--radius)/2)]", className)} {...props} />;
}
