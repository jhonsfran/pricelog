import { Field, FieldError, FieldLabel } from "@my-better-t-app/ui/components/field";
import { Input } from "@my-better-t-app/ui/components/input";
import type { AnyFieldApi } from "@tanstack/react-form";

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
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
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
