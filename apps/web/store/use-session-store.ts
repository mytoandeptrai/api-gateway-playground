import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SessionStoreState = {
  token: string | null;
  refreshToken: string | null;
};

export type SessionStoreActions = {
  reset: () => void;
  setToken: (token: string | null) => void;
  setRefreshToken: (refreshToken: string | null) => void;
};

export type SessionStore = SessionStoreState & SessionStoreActions;

export const DEFAULT_SESSION_STORE_STATE: SessionStoreState = {
  token: null,
  refreshToken: null,
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SESSION_STORE_STATE,
      reset: () => set(DEFAULT_SESSION_STORE_STATE),
      setToken: (token: string | null) => set({ token }),
      setRefreshToken: (refreshToken: string | null) => set({ refreshToken }),
    }),
    {
      name: "__session_storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
