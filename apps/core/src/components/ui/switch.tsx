import * as SwitchPrimitive from "@radix-ui/react-switch";
import type * as React from "react";

import { cn } from "@/libs/utils";

function Switch({ className, onCheckedChange, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <>
      {/* Safari 原生 switch */}
      <input
        type="checkbox"
        // @ts-expect-error
        switch="true"
        className={cn("safari:block hidden accent-primary disabled:cursor-not-allowed disabled:opacity-50", className)}
        {...props}
        onChange={(e) => {
          onCheckedChange?.(e.target.checked);
        }}
      />

      {/* 非 Safari 使用 radix-ui */}
      <SwitchPrimitive.Root
        data-slot="switch"
        className={cn(
          "peer inline-flex safari:hidden h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
          className,
        )}
        onCheckedChange={onCheckedChange}
        {...props}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            "pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground",
          )}
        />
      </SwitchPrimitive.Root>
    </>
  );
}

export { Switch };
