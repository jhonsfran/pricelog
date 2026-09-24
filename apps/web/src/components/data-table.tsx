import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@my-better-t-app/ui/components/table";
import { cn } from "@my-better-t-app/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/**
 * A table of published values: labels in the record's caps, figures in the
 * mono face with tabular digits so a column of prices lines up.
 */
export function DataTable({
  columns,
  children,
  className,
}: {
  columns: readonly ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <Table className={cn("min-w-150", className)}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((column, index) => (
            <TableHead
              key={index}
              scope="col"
              className="kicker h-9 pl-0 pr-4 text-2xs font-normal text-muted-foreground"
            >
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

export function DataRow(props: ComponentProps<typeof TableRow>) {
  return <TableRow {...props} className={cn("border-gray-4 align-top", props.className)} />;
}

export function RowHeader({ className, ...props }: ComponentProps<typeof TableHead>) {
  return (
    <TableHead
      scope="row"
      className={cn(
        "h-auto py-3.5 pr-4 pl-0 align-top font-display text-sm font-semibold whitespace-normal",
        className,
      )}
      {...props}
    />
  );
}

export function DataCell({ className, ...props }: ComponentProps<typeof TableCell>) {
  return (
    <TableCell
      className={cn(
        "py-3.5 pr-4 pl-0 align-top font-mono text-xs text-gray-11 tabular-nums whitespace-normal [&_strong]:block [&_strong]:font-medium [&_strong]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** A qualifier printed under a value: its commitment, its caveat. */
export function CellNote({ children }: { children: ReactNode }) {
  return (
    <small className="mt-1 block font-mono text-2xs font-normal text-muted-foreground">
      {children}
    </small>
  );
}
