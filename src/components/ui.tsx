import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react"
import { Link, type LinkProps } from "react-router-dom"

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "quiet" | "danger"
  block?: boolean
}

export function Button({
  variant = "primary",
  block = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`btn btn-${variant} ${block ? "btn-block" : ""} ${className}`}
    />
  )
}

export function ButtonLink({
  variant = "primary",
  block = false,
  className = "",
  children,
  ...props
}: LinkProps & { variant?: ButtonProps["variant"]; block?: boolean }) {
  return (
    <Link className={`btn btn-${variant} ${block ? "btn-block" : ""} ${className}`} {...props}>
      {children}
    </Link>
  )
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor: string
  children: ReactNode
}) {
  const hintId = useId()
  const errorId = useId()
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Banner({
  tone,
  children,
}: {
  tone: "error" | "success" | "info"
  children: ReactNode
}) {
  return (
    <p className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <h2 className="mb-2 text-2xl">{title}</h2>
      <p className="mb-0">{body}</p>
    </div>
  )
}

export function PageHeader({
  title,
  lede,
  action,
}: {
  title: string
  lede?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="mb-2 text-4xl leading-tight">{title}</h1>
        {lede ? <p className="mb-0 max-w-3xl text-lg">{lede}</p> : null}
      </div>
      {action}
    </header>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "danger",
  pending = false,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  tone?: "danger" | "primary"
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="card w-full max-w-lg"
      >
        <h2 id="confirm-title" className="mb-2 text-3xl">
          {title}
        </h2>
        <p>{body}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button ref={cancelRef} variant="quiet" onClick={onCancel} disabled={pending}>
            Go back
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
