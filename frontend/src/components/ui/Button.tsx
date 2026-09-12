import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

export type ButtonVariant = "default" | "primary" | "mint" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  default: "",
  primary: "btn-primary",
  mint: "btn-mint",
  danger: "btn-danger",
  ghost: "btn-ghost",
};
const SIZE: Record<ButtonSize, string> = { sm: "btn-sm", md: "", lg: "btn-lg" };

export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "md", extra = "") {
  return `btn ${VARIANT[variant]} ${SIZE[size]} ${extra}`.replace(/\s+/g, " ").trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  icon?: ReactNode;
}

/** The one button. Sweep, ripple and lift come from the global button rules. */
export function Button({ variant = "default", size = "md", busy, icon, className = "", children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "default", size = "md", className = "", children, ...rest }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function AnchorButton({ variant = "default", size = "md", className = "", children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <a className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </a>
  );
}
