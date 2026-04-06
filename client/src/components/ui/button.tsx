import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        premium:
          "relative overflow-hidden border border-[#d9b977]/60 bg-[linear-gradient(135deg,#8A6526_0%,#C9A55B_26%,#F6E2A6_50%,#B8863B_74%,#8A6526_100%)] text-[#050505] shadow-[0_14px_34px_rgba(201,165,91,0.28)] before:absolute before:inset-[1px] before:rounded-[inherit] before:bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.02))] before:opacity-90 before:content-[''] after:absolute after:-left-[38%] after:top-[-130%] after:h-[320%] after:w-[42%] after:rotate-[18deg] after:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.85),transparent)] after:transition-transform after:duration-500 after:content-[''] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_20px_40px_rgba(201,165,91,0.36)] hover:after:translate-x-[240%]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-gold/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.46),rgba(255,255,255,0.14))] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] hover:border-gold/50 hover:bg-[linear-gradient(90deg,rgba(201,165,91,0.08),rgba(255,250,238,0.88),rgba(201,165,91,0.12))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] dark:border-input dark:hover:bg-[linear-gradient(90deg,rgba(201,165,91,0.12),rgba(26,24,22,0.92),rgba(201,165,91,0.16))]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
