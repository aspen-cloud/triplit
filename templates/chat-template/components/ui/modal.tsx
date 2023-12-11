import React from "react"

import { Dialog, DialogContent, DialogHeader } from "./dialog.jsx"

export function Modal(
  props: React.ComponentProps<typeof Dialog> & { title?: string }
) {
  const { children, title, ...rest } = props
  return (
    <Dialog {...rest}>
      <DialogContent>
        {title && <DialogHeader>{title}</DialogHeader>}
        {children}
      </DialogContent>
    </Dialog>
  )
}
