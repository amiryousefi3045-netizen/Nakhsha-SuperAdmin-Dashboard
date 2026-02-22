import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { User } from "../types/api";
import {
  verifyOtp,
  me,
  updateMe,
  getToken,
  clearToken,
} from "../services/auth";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthed: boolean;
  loginWithOtpVerify: (
    phone: string,
    code: string,
    rememberMe?: boolean,
  ) => Promise<{ token: string; user: User }>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  updateUser: (payload: {
    name?: string;
    bio?: string;
    city?: string;
    neighborhood?: string;
  }) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthed = user !== null;

  const refreshMe = async (): Promise<void> => {
    try {
      const userData = await me();
      setUser(userData);
    } catch (error: any) {
      // If unauthorized, clear token and set user to null
      if (error.code === "UNAUTHORIZED" || error.code === "TOKEN_EXPIRED") {
        clearToken();
        setUser(null);
      }
      throw error;
    }
  };

  const loginWithOtpVerify = async (
    phone: string,
    code: string,
    rememberMe = false,
  ) => {
    const result = await verifyOtp(phone, code, rememberMe);
    setUser(result.user);
    return result;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const updateUser = async (payload: {
    name?: string;
    bio?: string;
    city?: string;
    neighborhood?: string;
  }): Promise<User> => {
    if (!user) {
      throw new Error("No user logged in");
    }

    // Store original user data for rollback
    const originalUser = user;

    // Optimistic update
    const optimisticUser: User = {
      ...user,
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.bio !== undefined && { bio: payload.bio }),
      location: {
        ...user.location,
        ...(payload.city !== undefined && { city: payload.city }),
        ...(payload.neighborhood !== undefined && {
          neighborhood: payload.neighborhood,
        }),
      },
    };
    setUser(optimisticUser);

    try {
      const updatedUser = await updateMe(payload);
      setUser(updatedUser);
      return updatedUser;
    } catch (error) {
      // Rollback on error
      setUser(originalUser);
      throw error;
    }
  };

  // Hydration logic on mount
  useEffect(() => {
    const token = getToken();

    if (!token) {
      setIsLoading(false);
      return;
    }

    refreshMe()
      .catch((error) => {
        // If refresh fails with UNAUTHORIZED, token is invalid
        if (error.code === "UNAUTHORIZED" || error.code === "TOKEN_EXPIRED") {
          clearToken();
          setUser(null);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Keep React state in sync when the apiClient interceptor detects a 401.
  // The interceptor already calls TokenManager.clear(); here we clear the user.
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthed,
    loginWithOtpVerify,
    logout,
    refreshMe,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
