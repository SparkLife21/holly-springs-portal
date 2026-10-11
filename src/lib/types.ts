export type DirectorySharing = {
  email: boolean
  mobile_phone: boolean
  home_phone: boolean
  photo: boolean
  birthdate: boolean
}

export type DirectoryMember = {
  id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  is_child: boolean
  in_directory: boolean
  email: string | null
  mobile_phone: string | null
  home_phone: string | null
  photo_url: string | null
  birthdate: string | null
  sharing: DirectorySharing | null
}

export type DirectoryHousehold = {
  id: string
  name: string
  address: string | null
  primary_phone: string | null
  in_directory: boolean
  is_own_household: boolean
  members: DirectoryMember[]
}

export type LinkedProfile = {
  linked: true
  person_id: string
  household_id: string
  household_name: string
  first_name: string
  last_name: string
  preferred_name: string | null
  email: string | null
  is_child: boolean
  roles: string[]
}

export type Profile = { linked: false; reason: "unlinked" | "archived" } | LinkedProfile

export type ContactPreferences = {
  alert_by_call: boolean
  alert_by_text: boolean
  alert_by_email: boolean
  alert_by_push: boolean
  sms_consent_at: string | null
  sms_opted_out_at: string | null
}

export const emptySharing: DirectorySharing = {
  email: true,
  mobile_phone: true,
  home_phone: true,
  photo: true,
  birthdate: false,
}

export const ROLE_DETAILS = [
  {
    key: "super_admin",
    label: "Super Admin",
    description: "Everything, including who the admins are.",
  },
  {
    key: "admin",
    label: "Admin",
    description: "Directory, households, events, alerts, and moderation.",
  },
  {
    key: "alert_sender",
    label: "Alert Sender",
    description: "Send phone-tree alerts without full admin access.",
  },
  {
    key: "childrens_ministry_lead",
    label: "Children's Ministry Lead",
    description: "All children's records, when check-in is added.",
  },
  {
    key: "proctor",
    label: "Proctor",
    description: "Check children in and out, when check-in is added.",
  },
  {
    key: "treasurer",
    label: "Treasurer",
    description: "Giving and reimbursements, when those are added.",
  },
  {
    key: "member",
    label: "Member",
    description: "A recorded member role. Directory access does not require this box.",
  },
] as const

export type RoleKey = (typeof ROLE_DETAILS)[number]["key"]
