import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
export function LiquidGlass({asChild,variant,shadow=true,bezel=8,tint,className,style,...props}:React.ComponentProps<"div">&{asChild?:boolean;variant?:"frosted";shadow?:boolean;bezel?:number;tint?:string}) {
 const Comp=asChild ? Slot.Root : "div";
 return <Comp className={cn("liquid-glass",className)} style={{backgroundColor:tint ?? (variant==="frosted"?"var(--glass-tint-frosted)":"var(--glass-tint)"),backdropFilter:`blur(${bezel}px)`,boxShadow:shadow?"var(--glass-rim), var(--glass-shadow)":"var(--glass-rim)",...style}} {...props}/>;
}
