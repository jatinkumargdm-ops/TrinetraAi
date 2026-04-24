import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  zoneId: integer("zone_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  severity: text("severity").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("active"),
  acknowledgedBy: text("acknowledged_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type Alert = typeof alertsTable.$inferSelect;
