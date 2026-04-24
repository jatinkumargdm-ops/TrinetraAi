import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const venuesTable = pgTable("venues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  capacity: integer("capacity").notNull(),
  totalAreaSqm: integer("total_area_sqm").notNull(),
  status: text("status").notNull().default("operational"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Venue = typeof venuesTable.$inferSelect;
