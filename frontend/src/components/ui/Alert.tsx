import React from "react";
import cn from "classnames";

type AlertVariant = "info" | "success" | "warning" | "error";

interface AlertProps {
  variant: AlertVariant;
  message: React.ReactNode;
  className?: string;
  duration?: number;
}

const variants: Record<AlertVariant, string> = {
  info: "bg-blue-50 text-blue-800 border-blue-200",
  success: "bg-green-50 text-green-800 border-green-200",
  warning: "bg-yellow-50 text-yellow-800 border-yellow-200",
  error: "bg-red-50 text-red-800 border-red-200",
};

export const Alert: React.FC<AlertProps> & {
  show: (props: AlertProps) => void;
} = ({ variant, message, className }) => {
  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        variants[variant],
        className
      )}
      role="alert"
    >
      {message}
    </div>
  );
};

// Static method for showing temporary alerts
Alert.show = ({ message, variant, duration = 3000 }) => {
  // Create alert container if it doesn't exist
  let container = document.getElementById("alert-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "alert-container";
    container.className = "fixed top-4 right-4 z-50 flex flex-col gap-2";
    document.body.appendChild(container);
  }

  // Create alert element
  const alertEl = document.createElement("div");
  alertEl.className = cn(
    "rounded-md border px-4 py-3 text-sm animate-fade-in",
    variants[variant]
  );
  alertEl.textContent = message as string;

  // Add to container
  container.appendChild(alertEl);

  // Remove after duration
  setTimeout(() => {
    alertEl.classList.add("animate-fade-out");
    setTimeout(() => alertEl.remove(), 150);
  }, duration);
};
