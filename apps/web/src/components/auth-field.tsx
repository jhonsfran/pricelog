import { Field, FieldError, FieldLabel } from "@my-better-t-app/ui/components/field";
import { Input } from "@my-better-t-app/ui/components/input";
import type { AnyFieldApi } from "@tanstack/react-form";
import type { ReactNode } from "react";

export function AuthField({
  field,
  label,
  type = "text",
  placeholder,
  autoComplete,
}: {
  field: AnyFieldApi;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const errors = field.state.meta.errors.flatMap((error) => {
    if (typeof error === "string") return [{ message: error }];
    if (error && typeof error === "object" && "message" in error) {
      const message = error.message;
      return typeof message === "string" ? [{ message }] : [];
    }
    return [];
  });
  const invalid = errors.length > 0;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name} className="kicker text-muted-foreground">
        {label}
      </FieldLabel>
      <Input
        className="h-11 bg-card px-3.5 text-sm md:text-sm dark:bg-card"
        id={field.name}
        name={field.name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      <FieldError errors={errors} />
    </Field>
  );
}

/** The owner console's sign-in and sign-up screens share one frame. */
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-md px-6 pt-22 pb-30 max-sm:pt-14">
      <p className="kicker text-muted-foreground">Owner console</p>
      <h1 className="mt-2.5 mb-2 text-5xl leading-[0.95] tracking-[-0.04em] sm:text-6xl">
        {title}
      </h1>
      <p className="mb-9 leading-relaxed text-muted-foreground">{intro}</p>
      {children}
      <p className="mt-7 border-t pt-5 text-muted-foreground">{footer}</p>
    </main>
  );
}
