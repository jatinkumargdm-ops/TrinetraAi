import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";

export const zonesTable = pgTable("zones", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  areaSqm: real("area_sqm").notNull(),
  gridX: integer("grid_x").notNull(),
  gridY: integer("grid_y").notNull(),
  currentPeople: integer("current_people").notNull().default(0),
  currentDensity: real("current_density").notNull().default(0),
  avgVelocity: real("avg_velocity").notNull().default(0),
  flowDirection: text("flow_direction").notNull().default("N"),
  riskTier: text("risk_tier").notNull().default("low"),
  riskScore: real("risk_score").notNull().default(0),
  status: text("status").notNull().default("operational"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export type Zone = typeof zonesTable.$inferSelect;
