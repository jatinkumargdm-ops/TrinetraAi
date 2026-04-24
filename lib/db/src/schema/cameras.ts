import { pgTable, serial, integer, text, real, timestamp } from "drizzle-orm/pg-core";

export const camerasTable = pgTable("cameras", {
  id: serial("id").primaryKey(),
  zoneId: integer("zone_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("online"),
  accuracy: real("accuracy").notNull().default(98),
  lastPing: timestamp("last_ping", { withTimezone: true }).notNull().defaultNow(),
});

export type Camera = typeof camerasTable.$inferSelect;
