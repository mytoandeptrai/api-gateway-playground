import { create } from 'zustand';

type SessionStoreState = {
  token: string | null;
};

type SessionStoreActions = {
  reset: () => void;
  setToken: (token: string | null) => void;
};

export type SessionStore = SessionStoreState & SessionStoreActions;

const DEFAULT_STATE: SessionStoreState = { token: null };

// accessToken in-memory only — refreshToken lives in httpOnly cookie (managed by server)
export const useSessionStore = create<SessionStore>()((set) => ({
  ...DEFAULT_STATE,
  reset: () => set(DEFAULT_STATE),
  setToken: (token) => set({ token }),
}));
