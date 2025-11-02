import { useContext } from "react";
import AuthCtx from "../context/authContext";

export const useAuth = () => useContext(AuthCtx);
