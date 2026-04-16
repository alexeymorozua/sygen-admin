"use client";

import { SelectHTMLAttributes, forwardRef } from "react";

const CHEVRON_SVG =
  "url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')";

const BASE =
  "bg-bg-card border border-border rounded-lg pl-3 pr-8 py-1.5 text-sm appearance-none bg-no-repeat focus:outline-none focus:border-accent";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", style, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        {...rest}
        className={`${BASE} ${className}`}
        style={{
          backgroundImage: CHEVRON_SVG,
          backgroundSize: "12px",
          backgroundPosition: "right 10px center",
          ...style,
        }}
      >
        {children}
      </select>
    );
  },
);
