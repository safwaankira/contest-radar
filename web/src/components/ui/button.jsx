import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// DESIGN.md: button-primary (lavender), button-secondary (charcoal + hairline), button-tertiary (plain).
// 8px corners, 8px 14px padding, 14px/500 labels, never pill.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-[14px] font-medium leading-[1.2] transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-[var(--primary-focus)]",
        secondary: "border border-hairline bg-surface-1 text-ink hover:bg-surface-2",
        ghost: "text-ink-subtle hover:bg-surface-1 hover:text-ink",
        link: "px-0 text-ink-muted underline-offset-4 hover:text-ink hover:underline",
      },
      size: { default: "h-10 px-[14px]", sm: "h-9 px-3", lg: "h-11 px-5 text-[15px]" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
