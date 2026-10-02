'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'

// Promise-based replacements for window.confirm / window.prompt, rendered with
// the app's AlertDialog. <DialogHost /> is mounted once in the root layout;
// call sites just `await confirmDialog(...)`. Requests queue, one at a time.

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  // Red confirm button for spending money or deleting.
  destructive?: boolean
}

type PromptOptions = Omit<ConfirmOptions, 'destructive'> & {
  defaultValue?: string
  placeholder?: string
}

type Request =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }

let queue: Request[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

function enqueue(request: Request) {
  queue = [...queue, request]
  emit()
}

// Settles only the request still on screen: Radix fires onOpenChange(false)
// right after an action click, which must not cancel the next queued one.
function settle(request: Request, value: boolean | string | null) {
  const [current, ...rest] = queue
  if (!current || current !== request) return
  queue = rest
  emit()
  if (current.kind === 'confirm') current.resolve(value === true)
  else current.resolve(typeof value === 'string' ? value : null)
}

export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const normalized = typeof options === 'string' ? { title: options } : options
  return new Promise((resolve) => enqueue({ kind: 'confirm', options: normalized, resolve }))
}

export function promptDialog(options: PromptOptions | string): Promise<string | null> {
  const normalized = typeof options === 'string' ? { title: options } : options
  return new Promise((resolve) => enqueue({ kind: 'prompt', options: normalized, resolve }))
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const getSnapshot = () => queue[0] ?? null
const getServerSnapshot = () => null

export function DialogHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setValue(current.options.defaultValue ?? '')
      // Focus after Radix moves focus into the dialog.
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [current])

  // Pending requests resolve as cancelled if the host unmounts.
  useEffect(() => () => {
    while (queue.length) settle(queue[0], null)
  }, [])

  if (!current) return null
  const { options } = current
  const destructive = current.kind === 'confirm' && current.options.destructive
  const confirm = () => settle(current, current.kind === 'prompt' ? value : true)
  const cancel = () => settle(current, null)

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) cancel() }}>
      <AlertDialogContent className="border-white/10 bg-[#1d2027] text-slate-100">
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title}</AlertDialogTitle>
          {options.description ? (
            <AlertDialogDescription className="whitespace-pre-line text-slate-400">{options.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {current.kind === 'prompt' ? (
          <Input
            ref={inputRef}
            value={value}
            placeholder={current.options.placeholder}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); confirm() } }}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancel}>{options.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            className={destructive ? 'bg-red-500 text-white hover:bg-red-600' : undefined}
          >
            {options.confirmLabel ?? 'OK'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
