import { useEffect, useState } from "react";
import AuthCtx from "../context/authContext";
import {
  me,
  otpStart,
  otpVerify,
  logout as doLogout,
  getToken,
} from "../services/auth";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    me()
      .then((u) => {
        if (u) {
          setUser(u);
        } else {
          doLogout();
          setUser(null);
        }
      })
      .catch(() => {
        doLogout();
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const startOtp = async (phone) => {
    return await otpStart(phone);
  };

  const verifyOtp = async (phone, code) => {
    const result = await otpVerify(phone, code);
    const userData = await me();
    setUser(userData);
    return result;
  };

  const logout = () => {
    doLogout();
    setUser(null);
  };

  const value = {
    user,
    setUser,
    loading,
    startOtp,
    verifyOtp,
    logout,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
