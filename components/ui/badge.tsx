import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex w-fit items-center rounded-md border px-2 py-0.5 font-medium text-xs whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-foreground",
      success: "border-orange-400/25 bg-orange-400/10 text-orange-200",
      warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
      destructive: "border-red-400/25 bg-red-400/10 text-red-200",
      info: "border-rose-400/25 bg-rose-400/10 text-rose-200",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
