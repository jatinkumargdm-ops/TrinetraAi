import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";

export const densityReadingsTable = pgTable("density_readings", {
  id: serial("id").primaryKey(),
  zoneId: integer("zone_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  peopleCount: integer("people_count").notNull(),
  density: real("density").notNull(),
  avgVelocity: real("avg_velocity").notNull(),
  flowDirection: text("flow_direction").notNull(),
  riskScore: real("risk_score").notNull(),
});

export type DensityReading = typeof densityReadingsTable.$inferSelect;
