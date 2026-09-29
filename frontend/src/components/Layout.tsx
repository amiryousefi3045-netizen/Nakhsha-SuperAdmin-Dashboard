import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState, type FC } from "react";
import { getServiceStatus, type ServiceStatus } from "../services/health";
import Navbar from "./Navbar";

const Layout: FC = () => {
  const [status, setStatus] = useState<ServiceStatus>("online");
  useEffect(() => {
    let stop = false;
    const run = async () => {
      const next = await getServiceStatus();
      if (!stop) setStatus(next);
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
      {status === "degraded" && (
        <div className="bg-amber-500 text-white text-center text-sm py-1">
          سرویس با اختلال کار می‌کند: پایگاه داده در دسترس نیست. ثبت و
          پرداخت تا اتصال دوباره برقرار شود ممکن است انجام نشود.
        </div>
      )}
      {status === "offline" && (
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
