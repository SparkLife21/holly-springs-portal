export function displayName(person: {
  first_name: string
  last_name: string
  preferred_name?: string | null
}) {
  const first = person.preferred_name?.trim() || person.first_name
  return `${first} ${person.last_name}`.trim()
}

export function phoneHref(phone: string, kind: "tel" | "sms") {
  const compact = phone.trim().replace(/[^\d+]/g, "")
  return `${kind}:${compact}`
}

export function formatBirthdate(value: string | null) {
  if (!value) return null
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function safeNextPath(value: unknown) {
  if (typeof value !== "string") return "/"
  if (!value.startsWith("/") || value.startsWith("//")) return "/"
  return value
}
