"use client";

import type { Field } from "@akana/schema";
import type { ReactNode } from "react";

/**
 * Label and help text above a control. When `htmlFor` is given the label
 * points at a single input. When it is not, the label is a heading inside a
 * group and the group carries the aria-label.
 */
export function FieldHead({ field, htmlFor, id }: { field: Field; htmlFor?: string; id?: string }) {
  const optional = field.optional ? <span className="ak-muted ak-small"> (optional)</span> : null;
  return (
    <>
      {htmlFor ? (
        <label className="ak-q" htmlFor={htmlFor} id={id}>
          {field.label}
          {optional}
        </label>
      ) : (
        <span className="ak-q" id={id}>
          {field.label}
          {optional}
        </span>
      )}
      {field.help ? (
        <p className="ak-help ak-muted ak-small" id={htmlFor ? `${htmlFor}-help` : undefined}>
          {field.help}
        </p>
      ) : null}
    </>
  );
}

export function FieldShell({ children, type }: { children: ReactNode; type: string }) {
  return (
    <div className={`ak-field ak-field-${type}`} data-field-type={type}>
      {children}
    </div>
  );
}

/** A pressable chip. Buttons so every chip is reachable by Tab and operable by Space or Enter. */
export function Chip({
  pressed,
  onPress,
  label,
  children,
  disabled,
}: {
  pressed: boolean;
  onPress: () => void;
  label?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="ak-chip"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onPress}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
