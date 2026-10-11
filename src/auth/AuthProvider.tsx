import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import { useNavigate } from "react-router-dom"
import type { Profile } from "../lib/types.ts"
import { supabase } from "../lib/supabase.ts"

type AuthState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    if (!supabase) return
    const { error: linkError } = await supabase.rpc("link_my_account")
    if (linkError) console.error(linkError)
    const { data, error } = await supabase.rpc("current_profile")
    if (error) {
      console.error(error)
      setProfile({ linked: false, reason: "unlinked" })
      return
    }
    setProfile((data as Profile | null) ?? { linked: false, reason: "unlinked" })
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (data.session) {
        void refreshProfile().finally(() => {
          if (alive) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (!next) {
        setProfile(null)
        setLoading(false)
        return
      }
      window.setTimeout(() => {
        void refreshProfile().finally(() => setLoading(false))
      }, 0)
      if (event === "PASSWORD_RECOVERY") navigate("/reset-password")
    })

    return () => {
      alive = false
      subscription.subscription.unsubscribe()
    }
  }, [navigate, refreshProfile])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({ session, profile, loading, refreshProfile, signOut }),
    [session, profile, loading, refreshProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside AuthProvider")
  return value
}
