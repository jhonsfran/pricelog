import { sql, type SQLWrapper } from "drizzle-orm";

export function planCountSql(snapshot: SQLWrapper) {
  return sql<number>`(select count(*) from (
    select json_extract(offer.value, '$.name') as name from json_each(${snapshot}, '$.offers') as offer
    where json_array_length(offer.value, '$.prices') = 0
    or exists (select 1 from json_each(offer.value, '$.prices') as price
      where json_extract(price.value, '$.kind') in ('flat', 'per_seat', 'usage', 'free', 'custom'))
    union
    select json_extract(cell.value, '$.offer') as name
    from json_each(${snapshot}, '$.features') as feature,
      json_each(feature.value, '$.availability') as cell
    where not exists (select 1 from json_each(${snapshot}, '$.offers') as priced
      where json_extract(priced.value, '$.name') = json_extract(cell.value, '$.offer'))
  ))`;
}
