import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const incidentsTable = pgTable("incidents", {
  id: serial("id").primaryKey(),
  zoneId: integer("zone_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  peopleAffected: integer("people_affected").notNull().default(0),
});

export type Incident = typeof incidentsTable.$inferSelect;
