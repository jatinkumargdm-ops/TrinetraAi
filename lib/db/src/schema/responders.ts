import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const respondersTable = pgTable("responders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("available"),
  assignedZoneId: integer("assigned_zone_id"),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
});

export type Responder = typeof respondersTable.$inferSelect;
