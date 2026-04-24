import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

export const evacuationRoutesTable = pgTable("evacuation_routes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fromZoneId: integer("from_zone_id").notNull(),
  toExitName: text("to_exit_name").notNull(),
  capacityPerMin: integer("capacity_per_min").notNull(),
  status: text("status").notNull().default("clear"),
  estimatedClearTime: integer("estimated_clear_time").notNull().default(0),
  currentLoad: integer("current_load").notNull().default(0),
});

export type EvacuationRoute = typeof evacuationRoutesTable.$inferSelect;
