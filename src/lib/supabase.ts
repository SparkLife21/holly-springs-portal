import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL ?? ""
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""

export const isSupabaseConfigured = url.startsWith("https://") && anonKey.length > 20

const sharedTabletKey = "hsbc-shared-tablet"

export const authStorage = {
  getItem(key: string) {
    const store = sharedStore()
    return store.getItem(key)
  },
  setItem(key: string, value: string) {
    sharedStore().setItem(key, value)
  },
  removeItem(key: string) {
    window.sessionStorage.removeItem(key)
    window.localStorage.removeItem(key)
  },
}

export function markSharedTablet(enabled: boolean) {
  if (enabled) window.sessionStorage.setItem(sharedTabletKey, "1")
  else window.sessionStorage.removeItem(sharedTabletKey)
}

export function isSharedTablet() {
  return window.sessionStorage.getItem(sharedTabletKey) === "1"
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storage: authStorage,
      },
    })
  : null

export function requireClient() {
  if (!supabase) {
    throw new Error("The member portal is not connected yet.")
  }
  return supabase
}

function sharedStore() {
  return window.sessionStorage.getItem(sharedTabletKey) === "1"
    ? window.sessionStorage
    : window.localStorage
}
