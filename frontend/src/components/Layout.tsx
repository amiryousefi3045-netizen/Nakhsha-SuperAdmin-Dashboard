import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState, type FC } from "react";
import { checkHealth } from "../services/health";
import Navbar from "./Navbar";

const Layout: FC = () => {
  const [apiUp, setApiUp] = useState(true);
  useEffect(() => {
    let stop = false;
    const run = async () => {
      const ok = await checkHealth();
      if (!stop) setApiUp(ok);
    };
    run();
    const t = setInterval(run, 10000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  const location = useLocation();
  const isHome = location.pathname === "/";
  return (
    <div className="min-h-screen bg-nakhsha-bg">
      <Navbar />
      {!apiUp && (
        <div className="bg-red-600 text-white text-center text-sm py-1">
          اتصال به سرور برقرار نیست. برخی قابلیت‌ها غیرفعال‌اند.
        </div>
      )}
      <main
        className={`h-[calc(100vh-56px)] ${
          isHome ? "overflow-hidden" : "overflow-y-auto thin-scrollbar"
        } min-h-0`}
      >
        {/* 56px ~ nav height */}
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
