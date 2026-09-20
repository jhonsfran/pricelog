import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

export type DescendingTimestampCursor = {
  createdAt: number;
  id: string;
};

export function descendingCursorCondition(
  createdAt: SQLWrapper,
  id: SQLWrapper,
  cursor: DescendingTimestampCursor,
): SQL {
  return sql`(${createdAt} < ${cursor.createdAt} or (${createdAt} = ${cursor.createdAt} and ${id} < ${cursor.id}))`;
}
