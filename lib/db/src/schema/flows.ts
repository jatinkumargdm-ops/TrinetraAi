import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const flowsTable = pgTable("flows", {
  id: serial("id").primaryKey(),
  fromZoneId: integer("from_zone_id").notNull(),
  toZoneId: integer("to_zone_id").notNull(),
  peoplePerMinute: integer("people_per_minute").notNull(),
  direction: text("direction").notNull(),
  congestionLevel: text("congestion_level").notNull().default("clear"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Flow = typeof flowsTable.$inferSelect;
