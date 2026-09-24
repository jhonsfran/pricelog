import { CATEGORY_OPTIONS } from "@/lib/comparison-search";
import { SelectField } from "./select-field";

export function CategoryPicker({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (value: string) => void;
  counts?: readonly { cohort: string; pageCount: number }[];
}) {
  return (
    <SelectField
      id="product-category"
      label="Product category"
      value={value}
      onChange={onChange}
      options={CATEGORY_OPTIONS.map((option) => {
        const count = counts?.find((item) => item.cohort === option.value)?.pageCount;
        return {
          ...option,
          label: count === undefined ? option.label : `${option.label} (${count})`,
        };
      })}
    />
  );
}
