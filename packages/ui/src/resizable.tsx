"use client"

import * as React from "react"
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { cn } from "./utils"

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn("h-full w-full", className)}
      {...props}
    />
  )
}

function ResizablePanel(props: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />
}

/**
 * The gap between two panels doubles as the drag seam: invisible at rest, a
 * faint line on hover, a brighter one while dragging or focused. Double-click
 * resets the neighbouring panels to their default sizes.
 */
function ResizableHandle({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "relative w-3 outline-none after:absolute after:inset-y-3 after:left-1/2 after:w-px after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors data-[separator=hover]:after:bg-muted-foreground/40 data-[separator=active]:after:w-0.5 data-[separator=active]:after:bg-muted-foreground data-[separator=focus]:after:bg-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, usePanelRef }
export type { PanelImperativeHandle }
