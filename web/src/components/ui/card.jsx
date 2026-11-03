import { cn } from "@/lib/utils";
// DESIGN.md feature-card: surface-1, hairline, 12px corners, 24px padding.
export const Card = ({ className, ...p }) => <div className={cn("lift rounded-[12px] text-ink", className)} {...p} />;
export const CardHeader = ({ className, ...p }) => <div className={cn("flex flex-col gap-1 px-5 pt-5 pb-3", className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <h3 className={cn("text-[15px] font-medium tracking-[-0.2px]", className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn("px-5 pb-5", className)} {...p} />;
