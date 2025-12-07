import type { FC, HTMLAttributes, ReactNode } from "react";
import cn from "classnames";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card: FC<CardProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={cn(
        "bg-white rounded-lg shadow-sm border border-nakhsha-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
