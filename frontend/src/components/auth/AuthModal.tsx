import { useEffect, useRef } from "react";
import AuthPanel from "./AuthPanel";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: any) => void;
};

export default function AuthModal({ isOpen, onClose, onSuccess }: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", onKey);
      // lock scroll
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={modalRef}
        className="relative w-full max-w-lg mx-4 rounded-2xl shadow-xl overflow-hidden"
        style={{ backgroundColor: "#FAFAF7" }}
      >
        {/* Responsive: on small screens cover full height */}
        <div className="md:hidden h-screen overflow-auto">
          <AuthPanel onClose={onClose} onSuccess={onSuccess} />
        </div>
        <div className="hidden md:block">
          <AuthPanel onClose={onClose} onSuccess={onSuccess} />
        </div>
      </div>
    </div>
  );
}
