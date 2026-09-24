import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { cn } from "@my-better-t-app/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/**
 * One block of a record. `layered` shows the edges of older captures behind
 * it — use it where the block is itself a capture, not for every card.
 */
export function Panel({
  title,
  description,
  layered,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Card>, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  layered?: boolean;
}) {
  return (
    <Card
      className={cn(
        "mt-6 gap-5 overflow-visible text-sm/relaxed [--card-spacing:--spacing(6)] max-sm:[--card-spacing:--spacing(4)]",
        layered && "mt-9 mr-2.5 shadow-sheet",
        className,
      )}
      {...props}
    >
      {title || description ? (
        <CardHeader>
          {title ? (
            <CardTitle>
              <h2 className="text-xl">{title}</h2>
            </CardTitle>
          ) : null}
          {description ? (
            <CardDescription className="max-w-prose text-sm/relaxed">{description}</CardDescription>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-5">{children}</CardContent>
    </Card>
  );
}
