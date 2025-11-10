import { useContext } from "react";
import type { User } from "../types/api";
import AuthCtx from "../context/authContext";

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthCtx);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
