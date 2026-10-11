export type ImportPerson = {
  line: number
  householdName: string
  address: string
  primaryPhone: string
  firstName: string
  lastName: string
  preferredName: string
  email: string
  mobilePhone: string
  homePhone: string
  birthdate: string
  isChild: boolean
}

export type ImportPlan = {
  people: ImportPerson[]
  errors: string[]
}

const HEADERS = [
  "household_name",
  "address",
  "primary_phone",
  "first_name",
  "last_name",
  "preferred_name",
  "email",
  "mobile_phone",
  "home_phone",
  "birthdate",
  "is_child",
] as const

export function blankDirectoryCsv() {
  return toCsv([HEADERS.slice()])
}

export function downloadText(filename: string, contents: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  const source = text.replace(/^\uFEFF/, "")

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ",") {
      row.push(field)
      field = ""
      continue
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index += 1
      row.push(field)
      field = ""
      if (row.some((cell) => cell.trim() !== "")) rows.push(row)
      row = []
      continue
    }

    field += char
  }

  if (inQuotes) {
    throw new Error("The spreadsheet has a quote that was not closed. Check the file and try again.")
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((cell) => cell.trim() !== "")) rows.push(row)
  }

  return rows
}

export function toCsv(rows: string[][]) {
  return `${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`
}

export function planDirectoryImport(text: string): ImportPlan {
  const table = parseCsv(text)
  if (table.length === 0) {
    return { people: [], errors: ["The file is empty."] }
  }

  const header = table[0].map((cell) => cell.trim().toLowerCase())
  const missing = ["household_name", "first_name", "last_name"].filter(
    (name) => !header.includes(name),
  )
  if (missing.length > 0) {
    return {
      people: [],
      errors: [`Add these column headings: ${missing.join(", ")}. You can download a blank file below.`],
    }
  }

  const people: ImportPerson[] = []
  const errors: string[] = []

  table.slice(1).forEach((cells, index) => {
    const line = index + 2
    const value = (name: string) => {
      const column = header.indexOf(name)
      return column === -1 ? "" : (cells[column] ?? "").trim()
    }
    const householdName = value("household_name")
    const firstName = value("first_name")
    const lastName = value("last_name")
    const email = value("email").toLowerCase()
    const birthdate = value("birthdate")

    if (!householdName || !firstName || !lastName) {
      errors.push(`Row ${line} needs a household name, first name, and last name.`)
      return
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${line} has an email address that does not look complete.`)
      return
    }

    if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
      errors.push(`Row ${line} birthday must look like 1952-08-08.`)
      return
    }

    people.push({
      line,
      householdName,
      address: value("address"),
      primaryPhone: value("primary_phone"),
      firstName,
      lastName,
      preferredName: value("preferred_name"),
      email,
      mobilePhone: value("mobile_phone"),
      homePhone: value("home_phone"),
      birthdate,
      isChild: /^(yes|true|y|1)$/i.test(value("is_child")),
    })
  })

  return { people, errors }
}

function escapeCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}
