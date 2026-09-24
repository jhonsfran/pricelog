import { Field, FieldLabel } from "@my-better-t-app/ui/components/field";
import { ChevronDown } from "lucide-react";

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field className="select-field">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="select-control">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </div>
    </Field>
  );
}
