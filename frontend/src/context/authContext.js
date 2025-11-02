import { createContext } from "react";

const AuthCtx = createContext({ user: null, setUser: () => {} });
export default AuthCtx;
