import { create } from 'zustand'

interface AuthRoleState {
  /** Always 'admin' on desktop (no login there). Starts null until the first
   *  remoteAuth.getAuthStatus() resolves, so UI gating should treat null as
   *  "don't know yet" rather than "restrict" — the server-side check in
   *  remoteBridge.ts is the actual security boundary regardless of this. */
  role: 'admin' | 'operator' | null
  setRole: (role: 'admin' | 'operator' | null) => void
}

export const useAuthStore = create<AuthRoleState>((set) => ({
  role: null,
  setRole: (role) => set({ role })
}))
