"use client"

import React, { useEffect, useState } from "react"
import { AnimatePresence, motion, MotionConfig } from "framer-motion"
import { ChevronDownIcon, X } from "lucide-react"

export type TSelectData = {
  id: string
  label: string
  value: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
  custom?: React.ReactNode
  kind?: "video" | "image"
}

type SelectProps = {
  data?: TSelectData[]
  onChange?: (value: string, item?: TSelectData) => void
  defaultValue?: string
  value?: string
  disabled?: boolean
}

const Select = ({ data, defaultValue, value, onChange, disabled }: SelectProps) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<TSelectData | undefined>(undefined)

  useEffect(() => {
    const activeVal = value ?? defaultValue
    if (activeVal) {
      const item = data?.find((i) => i.value === activeVal)
      if (item) {
        setSelected(item)
      }
    } else {
      setSelected(data?.[0])
    }
  }, [value, defaultValue, data])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const onSelect = (nextValue: string) => {
    const item = data?.find((i) => i.value === nextValue)
    if (!item || item.disabled) return
    setSelected(item)
    setOpen(false)
    onChange?.(nextValue, item)
  }

  return (
    <MotionConfig
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
        ease: "0.65, 0, 0.35, 1",
      }}
    >
      <motion.div className="nx-model-picker relative flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          {!open ? (
            <motion.div
              whileTap={disabled ? undefined : { scale: 0.95 }}
              animate={{
                borderRadius: 30,
              }}
              layout
              layoutId="dropdown"
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-haspopup="listbox"
              aria-expanded={false}
              aria-label="Choose generation model"
              onClick={() => {
                if (!disabled) setOpen(true)
              }}
              onKeyDown={(event) => {
                if (!disabled && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault()
                  setOpen(true)
                }
              }}
              className="nx-model-picker-trigger overflow-hidden rounded-[30px] border border-[#ecebf0] bg-white text-[#202024] shadow-sm"
            >
              <SelectItem item={selected} />
            </motion.div>
          ) : (
            <motion.div
              layout
              animate={{
                borderRadius: 20,
              }}
              layoutId="dropdown"
              role="listbox"
              aria-label="Choose Model"
              className="nx-model-picker-panel absolute right-0 bottom-0 z-50 w-[min(360px,calc(100vw-48px))] overflow-hidden rounded-[20px] border border-[#e6e5ee] bg-white py-2 text-[#202024] shadow-xl"
              ref={ref}
            >
              <Head setOpen={setOpen} />
              <div className="max-h-[300px] w-full overflow-y-auto">
                {data?.map((item, idx) => (
                  <SelectItem
                    order={item?.value}
                    index={idx}
                    noDescription={false}
                    active={selected?.value === item.value}
                    key={item.id}
                    item={item}
                    onChange={onSelect}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  )
}

export default Select

const Head = ({ setOpen }: { setOpen: (open: boolean) => void }) => {
  return (
    <motion.div
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      exit={{
        opacity: 0,
      }}
      transition={{
        delay: 0.08,
      }}
      layout
      className="flex items-center justify-between border-b border-[#f1f0f6] px-4 py-3"
    >
      <motion.strong layout className="text-sm font-semibold text-[#18181f]">
        Choose Model
      </motion.strong>
      <button
        type="button"
        aria-label="Close model picker"
        onClick={() => setOpen(false)}
        className="nx-model-picker-close flex h-6 w-6 items-center justify-center rounded-full bg-[#f2f1f7] text-[#4b4a57] transition-colors hover:bg-[#e5e4ee]"
      >
        <X size={12} />
      </button>
    </motion.div>
  )
}

type SelectItemProps = {
  item?: TSelectData
  noDescription?: boolean
  order?: string
  index?: number
  active?: boolean
  onChange?: (index: string) => void
}

const animation = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: Math.min(custom * 0.03, 0.25),
      duration: 0.35,
    },
  }),
  exit: (custom: number) => ({
    opacity: 0,
    y: 10,
    transition: {
      delay: Math.min(custom * 0.015, 0.12),
    },
  }),
}

const SelectItem = ({
  item,
  noDescription = true,
  order,
  index = 0,
  active = false,
  onChange,
}: SelectItemProps) => {
  return (
    <motion.div
      className={`group flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-[#f6f5fd] ${
        noDescription ? "!px-2.5 !py-1.5" : ""
      } ${active && !noDescription ? "bg-[#f2f0ff]/90" : ""}`}
      variants={animation}
      initial="hidden"
      animate="visible"
      exit="exit"
      key={"product-" + item?.id + "-order-" + order}
      custom={index}
      onClick={() => {
        if (!noDescription) onChange?.(order as string)
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <motion.div
          layout
          layoutId={`icon-${item?.id}`}
          className={`flex shrink-0 items-center justify-center rounded-full border border-[#e6e4f2] bg-[#f7f6fc] text-[#352f59] ${
            noDescription ? "h-7 w-7" : "h-9 w-9"
          }`}
        >
          {item?.icon}
        </motion.div>
        <motion.div
          layout
          className={`flex min-w-0 flex-col ${noDescription ? "max-w-[168px]" : "w-56"}`}
        >
          <motion.strong
            layoutId={`label-${item?.id}`}
            className="truncate text-[13px] font-semibold text-[#14141f]"
          >
            {item?.label}
          </motion.strong>
          {noDescription ? null : (
            <span className="truncate text-xs text-[#646378]">
              {item?.description}
            </span>
          )}
        </motion.div>
      </div>
      {noDescription ? (
        <motion.div
          layout
          className="flex items-center justify-center gap-1 pr-2 text-[#565568]"
        >
          <ChevronDownIcon size={16} />
        </motion.div>
      ) : active ? (
        <span className="rounded-full bg-[#5b45f2]/10 px-2 py-0.5 text-[11px] font-medium text-[#5b45f2]">
          Active
        </span>
      ) : null}
    </motion.div>
  )
}
