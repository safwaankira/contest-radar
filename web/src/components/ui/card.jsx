import { cn } from "@/lib/utils";
export const Card = ({ className, ...p }) => <div className={cn("rounded-[var(--radius)] border border-border bg-card text-card-foreground", className)} {...p} />;
export const CardHeader = ({ className, ...p }) => <div className={cn("flex flex-col gap-1 p-4", className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <h3 className={cn("font-mono text-sm font-medium", className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn("p-4 pt-0", className)} {...p} />;
