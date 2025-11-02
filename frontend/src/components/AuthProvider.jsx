import { useEffect, useState } from "react";
import AuthCtx from "../context/authContext";
import { me, logout as doLogout } from "../services/auth";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    me()
      .then((u) => {
        if (u) {
          setUser(u);
          localStorage.setItem("user", JSON.stringify(u));
        }
      })
      .catch(() => {
        doLogout();
        setUser(null);
      });
  }, []);

  return (
    <AuthCtx.Provider value={{ user, setUser }}>{children}</AuthCtx.Provider>
  );
}
