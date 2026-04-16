"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type Size = "sm" | "md";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  loading?: boolean;
  size?: Size;
  iconSize?: number;
};

const sizeClasses: Record<Size, string> = {
  sm: "p-1.5",
  md: "p-2",
};

export const RefreshButton = forwardRef<HTMLButtonElement, Props>(
  function RefreshButton(
    {
      loading = false,
      size = "md",
      iconSize,
      className = "",
      disabled,
      title,
      ...rest
    },
    ref,
  ) {
    const { t } = useTranslation();
    const computedIconSize = iconSize ?? (size === "sm" ? 14 : 16);
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        title={title ?? t("common.refresh")}
        aria-label={title ?? t("common.refresh")}
        className={`${sizeClasses[size]} text-text-secondary hover:text-text-primary hover:bg-bg-primary rounded-lg transition-colors disabled:opacity-50 ${className}`}
        {...rest}
      >
        <RefreshCw size={computedIconSize} className={loading ? "animate-spin" : ""} />
      </button>
    );
  },
);
