'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const EASE = [0.25, 1, 0.5, 1] as const

export type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** `center` for confirmations, `drawer` for the record form. */
  variant?: 'center' | 'drawer'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showClose?: boolean
  /** Set when the dialog owns its own scroll region. */
  contentClassName?: string
}

const SIZES: Record<NonNullable<DialogContentProps['size']>, string> = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[760px]',
  xl: 'sm:max-w-[1040px]',
}

const DRAWER_SIZES: Record<NonNullable<DialogContentProps['size']>, string> = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[720px]',
  xl: 'sm:max-w-[900px]',
}

/**
 * Animated modal.
 *
 * Radix controls presence, Framer Motion controls the movement. `forceMount`
 * plus AnimatePresence is what lets the exit animation finish before the node
 * is removed - without it the dialog would vanish instantly on close.
 */
function DialogContent({
  className,
  children,
  variant = 'center',
  size = 'md',
  showClose = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Overlay forceMount asChild>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="fixed inset-0 z-50 bg-ink-900/25 backdrop-blur-[2px]"
        />
      </DialogPrimitive.Overlay>

      {/* `asChild` hands the motion element to Radix, which avoids the prop
          collision between Radix's `onDrag` and Framer's gesture props. */}
      <DialogPrimitive.Content forceMount asChild {...props}>
        <motion.div
          /*
           * The centred variant keeps its -50%/-50% offset inside the motion
           * values rather than in Tailwind classes: Framer writes `transform`
           * inline, which would otherwise overwrite a `-translate-x-1/2` and
           * leave the dialog hanging off the bottom-right of the viewport.
           */
          initial={
            variant === 'drawer'
              ? { opacity: 0, x: 32 }
              : { opacity: 0, scale: 0.97, x: '-50%', y: 'calc(-50% + 8px)' }
          }
          animate={
            variant === 'drawer'
              ? { opacity: 1, x: 0 }
              : { opacity: 1, scale: 1, x: '-50%', y: '-50%' }
          }
          exit={
            variant === 'drawer'
              ? { opacity: 0, x: 32 }
              : { opacity: 0, scale: 0.97, x: '-50%', y: 'calc(-50% + 8px)' }
          }
          transition={{ duration: 0.22, ease: EASE }}
          className={cn(
            'fixed z-50 flex flex-col bg-white shadow-xl focus:outline-none',
            variant === 'drawer'
              ? cn(
                  'inset-y-0 right-0 w-full border-l border-ink-100 sm:rounded-l-xl',
                  DRAWER_SIZES[size],
                )
              : cn(
                  'left-1/2 top-1/2 w-[calc(100%-2rem)] rounded-xl border border-ink-100',
                  'max-h-[calc(100dvh-3rem)]',
                  SIZES[size],
                ),
            className,
          )}
        >
          {children}
          {showClose ? (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4 grid size-8 place-items-center rounded-md text-ink-400',
                'transition-colors duration-150 hover:bg-ink-100 hover:text-ink-700',
              )}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({
  className,
  eyebrow,
  ...props
}: React.ComponentProps<'div'> & { eyebrow?: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-1 border-b border-ink-100 px-6 py-5 pr-14',
        className,
      )}
      {...props}
    >
      {eyebrow ? (
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
          {eyebrow}
        </span>
      ) : null}
      {props.children}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-[16.5px] font-semibold tracking-[-0.01em] text-ink-900', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-[13px] leading-relaxed text-ink-500', className)}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('scroll-polished min-h-0 flex-1 overflow-y-auto px-6 py-5', className)} {...props} />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 border-t border-ink-100 bg-ink-50/60 px-6 py-4',
        'sm:flex-row sm:items-center sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

/** Wrap a controlled Dialog so its exit animation can play. */
function AnimatedDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>{open ? children : null}</AnimatePresence>
    </Dialog>
  )
}

export {
  AnimatedDialog,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
