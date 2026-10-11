import type { Profile } from "./types.ts"

export function isAdminProfile(profile: Profile | null) {
  return (
    profile?.linked === true &&
    (profile.roles.includes("admin") || profile.roles.includes("super_admin"))
  )
}

export function isSuperAdminProfile(profile: Profile | null) {
  return profile?.linked === true && profile.roles.includes("super_admin")
}

export function greetingName(profile: Profile | null) {
  if (!profile?.linked) return null
  return profile.preferred_name?.trim() || profile.first_name
}
