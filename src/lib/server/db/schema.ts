import { pgTable, serial, text, integer, real, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const sensors = pgTable('sensors', {
	id: serial('id').primaryKey(),
	mac: text('mac').notNull().unique(), // uppercase, no colons e.g. C47C8D6D5E2F
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
	battery: integer('battery'), // % 0-100, null if sensor never reports it
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const plants = pgTable('plants', {
	id: serial('id').primaryKey(),
	// null = manual (sensorless) plant, tracked by eye via a SUStee-style indicator
	sensorId: integer('sensor_id').unique().references(() => sensors.id),
	name: text('name').notNull(),
	species: text('species'),
	sunlightNotes: text('sunlight_notes'),
	moistureMin: integer('moisture_min').notNull(),
	moistureMax: integer('moisture_max').notNull(),
	thresholdSource: text('threshold_source').notNull(), // 'openplantbook' | 'preset' | 'manual'
	careCategory: text('care_category'), // 'succulent'|'tropical'|'fern'|'herb'|'general' — drives the care card
	imageUrl: text('image_url'), // species photo from OpenPlantbook
	lastWateredAt: timestamp('last_watered_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const readings = pgTable('readings', {
	id: serial('id').primaryKey(),
	sensorId: integer('sensor_id').notNull().references(() => sensors.id),
	moisture: integer('moisture'),
	lux: integer('lux'),
	tempC: real('temp_c'),
	fertility: integer('fertility'),
	battery: integer('battery'),
	recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow()
});

export const alerts = pgTable('alerts', {
	id: serial('id').primaryKey(),
	sensorId: integer('sensor_id').notNull().references(() => sensors.id),
	plantId: integer('plant_id').references(() => plants.id),
	type: text('type').notNull(), // 'low_moisture' | 'low_battery' | 'sensor_silent'
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
	resolvedAt: timestamp('resolved_at', { withTimezone: true })
});

export const pushSubscriptions = pgTable('push_subscriptions', {
	id: serial('id').primaryKey(),
	subscription: jsonb('subscription').notNull(), // web-push PushSubscription JSON
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
