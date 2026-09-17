'use client'

import * as React from 'react'
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AnimatedDialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type ConfirmTone = 'danger' | 'warning' | 'neutral'

export type ConfirmOptions = {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

const TONE_STYLES: Record<ConfirmTone, { wrap: string; icon: React.ElementType }> = {
  danger: { wrap: 'bg-negative-soft text-negative', icon: Trash2 },
  warning: { wrap: 'bg-warning-soft text-warning', icon: AlertTriangle },
  neutral: { wrap: 'bg-brand-50 text-brand-600', icon: HelpCircle },
}

/**
 * In-app confirmation, in place of `window.confirm`.
 *
 * The native dialog cannot be styled, blocks the whole tab, and looks like a
 * browser warning rather than part of the product - which is exactly the wrong
 * tone for "you have unsaved changes".
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  options,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: ConfirmOptions | null
  onConfirm: () => void
}) {
  const tone = options?.tone ?? 'neutral'
  const { wrap, icon: Icon } = TONE_STYLES[tone]

  return (
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" showClose={false}>
        <DialogHeader className="pr-6">
          <div className="flex items-start gap-3">
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', wrap)}>
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle>{options?.title ?? 'Are you sure?'}</DialogTitle>
              {options?.description ? (
                <DialogDescription className="mt-1">{options.description}</DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="py-0" />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {options?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            autoFocus
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {options?.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </AnimatedDialog>
  )
}

/**
 * Promise-based confirmation.
 *
 *   const { confirm, confirmDialog } = useConfirm()
 *   if (await confirm({ title: 'Discard changes?' })) { ... }
 *   return <>{confirmDialog}</>
 */
export function useConfirm() {
  const [open, setOpen] = React.useState(false)
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null)
  const resolver = React.useRef<((value: boolean) => void) | null>(null)

  const confirm = React.useCallback((next: ConfirmOptions) => {
    setOptions(next)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = React.useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
  }, [])

  const confirmDialog = (
    <ConfirmDialog
      open={open}
      options={options}
      onOpenChange={(next) => {
        setOpen(next)
        // Closing by Escape, the overlay or Cancel all mean "no".
        if (!next) settle(false)
      }}
      onConfirm={() => settle(true)}
    />
  )

  return { confirm, confirmDialog }
}
