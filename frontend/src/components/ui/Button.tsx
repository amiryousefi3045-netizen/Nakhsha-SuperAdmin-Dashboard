import React from "react";
import cn from "classnames";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "text"
  | "success"
  | "error";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  as?: React.ElementType;
  to?: string;
  children: React.ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white border-transparent",
  secondary: "bg-gray-100 hover:bg-gray-200 text-gray-800 border-transparent",
  outline: "bg-transparent hover:bg-gray-50 text-gray-700 border-gray-300",
  text: "bg-transparent hover:bg-gray-50 text-gray-700 border-transparent",
  success: "bg-green-600 hover:bg-green-700 text-white border-transparent",
  error: "bg-red-600 hover:bg-red-700 text-white border-transparent",
};

const sizes: Record<ButtonSize, string> = {
  xs: "px-2 py-0.5 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      as: Component = "button",
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const classes = cn(
      "inline-flex items-center justify-center border rounded-md transition-colors",
      "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
      "disabled:opacity-60 disabled:cursor-not-allowed",
      variants[variant],
      sizes[size],
      className
    );

    return (
      <Component ref={ref} className={classes} disabled={disabled} {...props}>
        {children}
      </Component>
    );
  }
);
