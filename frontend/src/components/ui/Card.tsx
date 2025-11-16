import React from "react";
import cn from "classnames";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  className,
  children,
  ...props
}) => {
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
