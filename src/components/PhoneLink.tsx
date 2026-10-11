import { phoneHref } from "../lib/format.ts"

export function PhoneLink({
  phone,
  kind,
  label,
}: {
  phone: string
  kind: "tel" | "sms"
  label: string
}) {
  return (
    <a className="btn btn-secondary" href={phoneHref(phone, kind)}>
      {label} {phone}
    </a>
  )
}
