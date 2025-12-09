import { createContext } from "react";

const AuthCtx = createContext({
  user: null,
  setUser: () => {},
  loading: true,
  startOtp: () => {},
  verifyOtp: () => {},
  logout: () => {},
});

export default AuthCtx;
