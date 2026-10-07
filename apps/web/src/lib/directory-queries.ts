import type { DescendingTimestampCursor } from "@pricelog/api/pagination";
import { orpc } from "@/utils/orpc";
import type { DirectoryFilter } from "./directory-filter";

const staleTime = 60 * 60_000;

export const directoryOverviewOptions = () => ({
  ...orpc.directory.overview.queryOptions(),
  staleTime,
});

export const directoryCardsOptions = (filter: DirectoryFilter = {}, search = "") => ({
  ...orpc.directory.cards.infiniteOptions({
    input: (cursor: DescendingTimestampCursor | null) => ({
      ...filter,
      ...(search ? { search } : {}),
      ...(cursor ? { cursor } : {}),
      limit: 50,
    }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  }),
  staleTime,
});
