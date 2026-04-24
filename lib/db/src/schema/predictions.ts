import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";

export const predictionsTable = pgTable("predictions", {
  id: serial("id").primaryKey(),
  zoneId: integer("zone_id").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  horizonMin: integer("horizon_min").notNull(),
  predictedDensity: real("predicted_density").notNull(),
  predictedRisk: real("predicted_risk").notNull(),
  confidence: real("confidence").notNull(),
  recommendedAction: text("recommended_action").notNull(),
});

export type Prediction = typeof predictionsTable.$inferSelect;
