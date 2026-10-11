function rawMessage(error: unknown) {
  if (!error) return ""
  if (typeof error === "string") return error
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return ""
}

export function friendlyError(error: unknown) {
  const raw = rawMessage(error).trim()
  if (!raw) return "Something went wrong. Please try again."

  if (/invalid login credentials/i.test(raw)) {
    return "That email or password is not right. Try again, or email yourself a sign-in link."
  }

  if (/email not confirmed/i.test(raw)) {
    return "This sign-in is not confirmed yet. Ask an admin to send the invitation again."
  }

  if (/people_email_unique|duplicate key value/i.test(raw)) {
    return "That email is already used by someone else in the directory."
  }

  if (/row-level security|permission denied/i.test(raw)) {
    return "You do not have permission to do that."
  }

  if (/relation |syntax error|does not exist|column /i.test(raw)) {
    return "Something went wrong. Please try again, or ask an admin for help."
  }

  return raw
}
