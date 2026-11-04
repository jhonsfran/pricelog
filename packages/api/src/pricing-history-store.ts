import type { Database } from "@pricelog/db";
import { createPricingHistoryRepository } from "./pricing-history-repository";

export async function readWeeklyHistory(db: Database, now = new Date()) {
  const history = createPricingHistoryRepository(db);
  await history.requireAllReady();
  return history.weeklyHistory(null, now);
}
