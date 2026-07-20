# Plant Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single SvelteKit PWA that ingests HHCC plant-sensor readings from MQTT, evaluates moisture/battery/silence twice daily, and sends Web Push alerts.

**Architecture:** One long-lived Node process (SvelteKit adapter-node on Railway) holds an MQTT subscription and an in-process 12h scheduler. Pure functions carry all decision logic (downsampling, threshold evaluation, alert lifecycle) so they unit-test without infrastructure; thin DB glue around them. Postgres via Drizzle.

**Tech Stack:** SvelteKit (Svelte 5, TypeScript, adapter-node), Tailwind v4, Drizzle ORM + postgres-js, mqtt.js, web-push, Vitest, pnpm.

## Global Constraints

- Single user, single hub (spec: no multi-user support).
- Readings stored at most once per sensor per hour (spec: downsample).
- Evaluation cadence every 12h; alert types exactly `low_moisture` | `low_battery` | `sensor_silent`; battery threshold <15%; silence threshold >36h; re-notify throttle 24h per open alert (all from spec).
- Threshold resolution order: OpenPlantbook lookup → category preset (succulent/tropical/fern/herb/general) → manual override always possible (spec).
- Env vars (exact names): `DATABASE_URL`, `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `APP_PASSWORD`, `AUTH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `OPENPLANTBOOK_API_KEY`.
- OpenMQTTGateway publishes to `+/+/BTtoMQTT/<MAC>`; HHCCJCY01 payload fields: `id` (colon MAC), `model_id: "HHCCJCY01HHCC"`, `tempc`, `moi` (moisture %), `lux`, `fer`; `batt` present only on HHCCJCY10 — treat as optional.
- OpenPlantbook API: `GET https://open.plantbook.io/api/v1/plant/search?q=<term>` and `GET https://open.plantbook.io/api/v1/plant/detail/{pid}` with header `X-API-Key`; response fields `pid`, `display_pid`, `min_soil_moist`, `max_soil_moist`.

## File Structure

```
docker-compose.yml              local Postgres 16
drizzle.config.ts               drizzle-kit config
src/hooks.server.ts             auth guard + boot (MQTT client, scheduler)
src/lib/server/db/schema.ts     tables: sensors, plants, readings, alerts, push_subscriptions
src/lib/server/db/index.ts      postgres-js client + drizzle instance
src/lib/server/ingest.ts        parseOmg() + shouldStoreReading() + ingest() glue
src/lib/server/mqtt.ts          startMqtt(): subscribe → ingest
src/lib/server/thresholds.ts    PRESETS + searchSpecies() + speciesThresholds()
src/lib/server/alerts.ts        evaluateSensor() + alertDecision() + runEvaluation() glue
src/lib/server/push.ts          sendPushToAll() + subscription pruning
src/lib/server/scheduler.ts     startScheduler(): 12h interval
src/lib/server/auth.ts          sessionToken() + isAuthed()
src/routes/login/+page.svelte   password form
src/routes/login/+page.server.ts
src/routes/+layout.server.ts    pass plants to layout
src/routes/+page.svelte         dashboard
src/routes/+page.server.ts
src/routes/plants/[id]/+page.svelte        plant detail + edit thresholds
src/routes/plants/[id]/+page.server.ts
src/routes/claim/[sensorId]/+page.svelte   claim form
src/routes/claim/[sensorId]/+page.server.ts
src/routes/api/species/+server.ts          proxy search to OpenPlantbook
src/routes/api/push/+server.ts             save push subscription
src/service-worker.js           push + notificationclick handlers
static/manifest.webmanifest
scripts/fake-publisher.mjs      publishes fixture OMG payloads to MQTT
tests/ingest.test.ts
tests/thresholds.test.ts
tests/alerts.test.ts
docs/hardware-setup.md          HiveMQ + ESP32 flash + Railway deploy runbook
```

---

### Task 1: Scaffold + local Postgres

**Files:**
- Create: entire SvelteKit skeleton (via `sv create`), `docker-compose.yml`, `.env`, `.env.example`, `drizzle.config.ts`
- Modify: `svelte.config.js`, `vite.config.ts`, `package.json`

**Interfaces:**
- Produces: running dev server, `pnpm test` (vitest), Postgres at `postgres://plant:plant@localhost:5432/plant`.

- [ ] **Step 1: Scaffold the app (run from the repo root, scaffolding into the existing dir)**

```bash
cd /Users/kyleshepherd/personal/plant-monitor
npx sv create --template minimal --types ts --no-add-ons --install pnpm .
```

If `sv create` refuses a non-empty directory, scaffold into `/tmp` and copy everything except `.git` and `docs/` in:

```bash
npx sv create --template minimal --types ts --no-add-ons --install pnpm /tmp/pm-scaffold
rsync -a --exclude .git /tmp/pm-scaffold/ .
pnpm install
```

- [ ] **Step 2: Add dependencies**

```bash
pnpm add drizzle-orm postgres mqtt web-push
pnpm add -D drizzle-kit @sveltejs/adapter-node vitest @tailwindcss/vite tailwindcss @types/web-push tsx
```

- [ ] **Step 3: Configure adapter-node, Tailwind, Vitest**

`svelte.config.js` — replace adapter import:

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: { adapter: adapter() }
};

export default config;
```

`vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: { include: ['tests/**/*.test.ts'] }
});
```

`src/app.css` (new): `@import 'tailwindcss';`

`src/routes/+layout.svelte` (create if missing):

```svelte
<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<main class="mx-auto max-w-2xl p-4">{@render children()}</main>
```

Add to `package.json` scripts: `"test": "vitest run", "db:push": "drizzle-kit push", "fake": "tsx scripts/fake-publisher.mjs"`.

- [ ] **Step 4: Local Postgres + env**

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: plant
      POSTGRES_PASSWORD: plant
      POSTGRES_DB: plant
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
volumes:
  pgdata:
```

`.env.example` (copy to `.env`, fill secrets later):

```
DATABASE_URL=postgres://plant:plant@localhost:5432/plant
MQTT_URL=
MQTT_USERNAME=
MQTT_PASSWORD=
APP_PASSWORD=change-me
AUTH_SECRET=generate-with-openssl-rand-hex-32
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
OPENPLANTBOOK_API_KEY=
```

`drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL! }
});
```

- [ ] **Step 5: Verify and commit**

```bash
docker compose up -d
pnpm dev &   # confirm http://localhost:5173 renders, then kill it
git add -A && git commit -m "feat: scaffold SvelteKit app with adapter-node, tailwind, drizzle, vitest"
```

---

### Task 2: Database schema

**Files:**
- Create: `src/lib/server/db/schema.ts`, `src/lib/server/db/index.ts`

**Interfaces:**
- Produces: exported Drizzle tables `sensors`, `plants`, `readings`, `alerts`, `pushSubscriptions`; `db` instance. Column names below are relied on by every later task.

- [ ] **Step 1: Write schema**

`src/lib/server/db/schema.ts`:

```ts
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
	sensorId: integer('sensor_id').notNull().unique().references(() => sensors.id),
	name: text('name').notNull(),
	species: text('species'),
	sunlightNotes: text('sunlight_notes'),
	moistureMin: integer('moisture_min').notNull(),
	moistureMax: integer('moisture_max').notNull(),
	thresholdSource: text('threshold_source').notNull(), // 'openplantbook' | 'preset' | 'manual'
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
```

`src/lib/server/db/index.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema });
export * from './schema';
```

- [ ] **Step 2: Push schema and verify**

```bash
pnpm db:push
docker compose exec db psql -U plant -c '\dt'
```

Expected: five tables listed.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: drizzle schema for sensors, plants, readings, alerts, push subscriptions"
```

---

### Task 3: Ingest logic (TDD)

**Files:**
- Create: `src/lib/server/ingest.ts`
- Test: `tests/ingest.test.ts`

**Interfaces:**
- Produces:
  - `parseOmg(topic: string, payload: string): ParsedReading | null` where `ParsedReading = { mac: string; moisture: number | null; lux: number | null; tempC: number | null; fertility: number | null; battery: number | null }`
  - `shouldStoreReading(lastStoredAt: Date | null, now: Date): boolean` (true if no reading in the last hour)
  - `ingest(topic: string, payload: string, now?: Date): Promise<void>` — DB glue used by Task 4.

- [ ] **Step 1: Write failing tests**

`tests/ingest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseOmg, shouldStoreReading } from '../src/lib/server/ingest';

const TOPIC = 'home/OMG_ESP32_BLE/BTtoMQTT/C47C8D6D5E2F';
const FLORA = JSON.stringify({
	id: 'C4:7C:8D:6D:5E:2F', name: 'Flower care', model: 'MiFlora',
	model_id: 'HHCCJCY01HHCC', tempc: 22.6, tempf: 72.68, moi: 27, lux: 1024, fer: 86
});

describe('parseOmg', () => {
	it('parses a MiFlora payload', () => {
		expect(parseOmg(TOPIC, FLORA)).toEqual({
			mac: 'C47C8D6D5E2F', moisture: 27, lux: 1024, tempC: 22.6, fertility: 86, battery: null
		});
	});
	it('includes battery when present (HHCCJCY10)', () => {
		const p = JSON.stringify({ id: 'C4:7C:8D:6D:5E:2F', model_id: 'HHCCJCY10', moi: 40, batt: 92 });
		expect(parseOmg(TOPIC, p)?.battery).toBe(92);
	});
	it('returns null for non-sensor messages (gateway status, other devices)', () => {
		expect(parseOmg('home/OMG_ESP32_BLE/LWT', 'online')).toBeNull();
		expect(parseOmg(TOPIC, JSON.stringify({ id: 'AA:BB:CC:DD:EE:FF', model_id: 'MUE4094RT' }))).toBeNull();
		expect(parseOmg(TOPIC, 'not json')).toBeNull();
	});
});

describe('shouldStoreReading', () => {
	const now = new Date('2026-07-20T12:00:00Z');
	it('stores when never stored', () => expect(shouldStoreReading(null, now)).toBe(true));
	it('skips within an hour', () =>
		expect(shouldStoreReading(new Date('2026-07-20T11:30:00Z'), now)).toBe(false));
	it('stores after an hour', () =>
		expect(shouldStoreReading(new Date('2026-07-20T10:59:00Z'), now)).toBe(true));
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../src/lib/server/ingest`.

- [ ] **Step 3: Implement**

`src/lib/server/ingest.ts`:

```ts
import { desc, eq } from 'drizzle-orm';
import { db, sensors, readings } from './db';

export type ParsedReading = {
	mac: string;
	moisture: number | null;
	lux: number | null;
	tempC: number | null;
	fertility: number | null;
	battery: number | null;
};

const PLANT_MODELS = /^HHCCJCY/;

export function parseOmg(topic: string, payload: string): ParsedReading | null {
	if (!topic.includes('/BTtoMQTT/')) return null;
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(payload);
	} catch {
		return null;
	}
	if (typeof data.id !== 'string' || !PLANT_MODELS.test(String(data.model_id ?? ''))) return null;
	const num = (v: unknown) => (typeof v === 'number' ? v : null);
	return {
		mac: data.id.replaceAll(':', '').toUpperCase(),
		moisture: num(data.moi),
		lux: num(data.lux),
		tempC: num(data.tempc),
		fertility: num(data.fer),
		battery: num(data.batt)
	};
}

const HOUR_MS = 60 * 60 * 1000;

export function shouldStoreReading(lastStoredAt: Date | null, now: Date): boolean {
	return !lastStoredAt || now.getTime() - lastStoredAt.getTime() >= HOUR_MS;
}

export async function ingest(topic: string, payload: string, now = new Date()): Promise<void> {
	const parsed = parseOmg(topic, payload);
	if (!parsed) return;

	const [sensor] = await db
		.insert(sensors)
		.values({ mac: parsed.mac, lastSeenAt: now, battery: parsed.battery })
		.onConflictDoUpdate({
			target: sensors.mac,
			set: { lastSeenAt: now, ...(parsed.battery !== null ? { battery: parsed.battery } : {}) }
		})
		.returning();

	const [latest] = await db
		.select({ recordedAt: readings.recordedAt })
		.from(readings)
		.where(eq(readings.sensorId, sensor.id))
		.orderBy(desc(readings.recordedAt))
		.limit(1);

	if (!shouldStoreReading(latest?.recordedAt ?? null, now)) return;

	await db.insert(readings).values({
		sensorId: sensor.id,
		moisture: parsed.moisture,
		lux: parsed.lux,
		tempC: parsed.tempC,
		fertility: parsed.fertility,
		battery: parsed.battery,
		recordedAt: now
	});
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test`
Expected: PASS (6 tests). Note the pure functions never touch `db`, so no Postgres needed for tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: OMG payload parsing and hourly-downsampled ingest"
```

---

### Task 4: MQTT wiring + fake publisher

**Files:**
- Create: `src/lib/server/mqtt.ts`, `scripts/fake-publisher.mjs`
- Modify: `src/hooks.server.ts` (create)

**Interfaces:**
- Consumes: `ingest(topic, payload)` from Task 3.
- Produces: `startMqtt(): void` (idempotent). `src/hooks.server.ts` exists and boots it — Task 6 adds the auth guard to this same file, Task 9 adds `startScheduler()`.

- [ ] **Step 1: Implement MQTT client**

`src/lib/server/mqtt.ts`:

```ts
import mqtt from 'mqtt';
import { env } from '$env/dynamic/private';
import { ingest } from './ingest';

let started = false;

export function startMqtt(): void {
	if (started || !env.MQTT_URL) return;
	started = true;

	const client = mqtt.connect(env.MQTT_URL, {
		username: env.MQTT_USERNAME,
		password: env.MQTT_PASSWORD,
		reconnectPeriod: 5000
	});

	client.on('connect', () => {
		console.log('[mqtt] connected');
		client.subscribe('+/+/BTtoMQTT/#');
	});
	client.on('message', (topic, payload) => {
		ingest(topic, payload.toString()).catch((e) => console.error('[mqtt] ingest failed', e));
	});
	client.on('error', (e) => console.error('[mqtt]', e.message));
}
```

`src/hooks.server.ts`:

```ts
import { startMqtt } from '$lib/server/mqtt';

startMqtt();
```

- [ ] **Step 2: Fake publisher script**

`scripts/fake-publisher.mjs`:

```js
// Publishes realistic OMG MiFlora payloads so the whole pipeline works pre-hardware.
// Usage: MQTT_URL=... MQTT_USERNAME=... MQTT_PASSWORD=... node scripts/fake-publisher.mjs [moisture]
import mqtt from 'mqtt';

const MACS = ['C4:7C:8D:6D:5E:2F', 'C4:7C:8D:6D:AA:BB'];
const moisture = Number(process.argv[2] ?? 35);

const client = mqtt.connect(process.env.MQTT_URL, {
	username: process.env.MQTT_USERNAME,
	password: process.env.MQTT_PASSWORD
});

client.on('connect', () => {
	for (const id of MACS) {
		const topic = `home/OMG_ESP32_BLE/BTtoMQTT/${id.replaceAll(':', '')}`;
		const payload = JSON.stringify({
			id, name: 'Flower care', model: 'MiFlora', model_id: 'HHCCJCY01HHCC',
			tempc: 21 + Math.random() * 3, moi: moisture, lux: Math.round(500 + Math.random() * 2000),
			fer: 90
		});
		client.publish(topic, payload, () => console.log('published', topic, payload));
	}
	setTimeout(() => client.end(), 500);
});
```

- [ ] **Step 3: Set up HiveMQ Cloud (manual, free tier)**

1. Sign up at https://console.hivemq.cloud → create a free Serverless cluster.
2. Create credentials (Access Management → add user+password).
3. Put in `.env`: `MQTT_URL=mqtts://<cluster-id>.s1.eu.hivemq.cloud:8883`, `MQTT_USERNAME`, `MQTT_PASSWORD`.

- [ ] **Step 4: Verify end-to-end**

```bash
pnpm dev &      # watch console for "[mqtt] connected"
pnpm fake 35
docker compose exec db psql -U plant -c 'select mac, last_seen_at from sensors; select sensor_id, moisture from readings;'
```

Expected: 2 sensors, 2 readings with moisture 35. Run `pnpm fake 35` again immediately → still 2 readings (downsample skips).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: MQTT ingestion wired to HiveMQ with fake publisher for testing"
```

---

### Task 5: Thresholds — presets + OpenPlantbook (TDD)

**Files:**
- Create: `src/lib/server/thresholds.ts`
- Test: `tests/thresholds.test.ts`

**Interfaces:**
- Produces:
  - `PRESETS: Record<'succulent' | 'tropical' | 'fern' | 'herb' | 'general', { moistureMin: number; moistureMax: number }>`
  - `searchSpecies(q: string, fetchFn?: typeof fetch): Promise<{ pid: string; display: string }[]>`
  - `speciesThresholds(pid: string, fetchFn?: typeof fetch): Promise<{ moistureMin: number; moistureMax: number } | null>` — null on API error/missing key/absent fields (caller falls back to presets).

- [ ] **Step 1: Write failing tests**

`tests/thresholds.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { PRESETS, searchSpecies, speciesThresholds } from '../src/lib/server/thresholds';

describe('PRESETS', () => {
	it('has all five categories with sane ranges', () => {
		for (const key of ['succulent', 'tropical', 'fern', 'herb', 'general'] as const) {
			const p = PRESETS[key];
			expect(p.moistureMin).toBeGreaterThan(0);
			expect(p.moistureMax).toBeGreaterThan(p.moistureMin);
		}
	});
});

describe('speciesThresholds', () => {
	it('maps OpenPlantbook fields', async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ pid: 'monstera deliciosa', min_soil_moist: 25, max_soil_moist: 65 }))
		);
		expect(await speciesThresholds('monstera deliciosa', fetchFn as unknown as typeof fetch))
			.toEqual({ moistureMin: 25, moistureMax: 65 });
	});
	it('returns null when the API fails', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
		expect(await speciesThresholds('x', fetchFn as unknown as typeof fetch)).toBeNull();
	});
	it('returns null when fetch throws (API down)', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
		expect(await speciesThresholds('x', fetchFn as unknown as typeof fetch)).toBeNull();
	});
});

describe('searchSpecies', () => {
	it('maps results and returns [] on failure', async () => {
		const ok = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ results: [{ pid: 'ficus lyrata', display_pid: 'Ficus lyrata' }] }))
		);
		expect(await searchSpecies('ficus', ok as unknown as typeof fetch))
			.toEqual([{ pid: 'ficus lyrata', display: 'Ficus lyrata' }]);
		const bad = vi.fn().mockRejectedValue(new Error('down'));
		expect(await searchSpecies('ficus', bad as unknown as typeof fetch)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `pnpm test`
Expected: FAIL — cannot resolve `thresholds`.

- [ ] **Step 3: Implement**

`src/lib/server/thresholds.ts`:

```ts
import { env } from '$env/dynamic/private';

export const PRESETS = {
	succulent: { moistureMin: 10, moistureMax: 50 },
	tropical: { moistureMin: 30, moistureMax: 65 },
	fern: { moistureMin: 35, moistureMax: 70 },
	herb: { moistureMin: 25, moistureMax: 60 },
	general: { moistureMin: 20, moistureMax: 60 }
} as const satisfies Record<string, { moistureMin: number; moistureMax: number }>;

const BASE = 'https://open.plantbook.io/api/v1/plant';
const headers = () => ({ 'X-API-Key': env.OPENPLANTBOOK_API_KEY ?? '' });

export async function searchSpecies(
	q: string,
	fetchFn: typeof fetch = fetch
): Promise<{ pid: string; display: string }[]> {
	if (!env.OPENPLANTBOOK_API_KEY) return [];
	try {
		const res = await fetchFn(`${BASE}/search?q=${encodeURIComponent(q)}`, { headers: headers() });
		if (!res.ok) return [];
		const data = await res.json();
		return (data.results ?? []).map((r: { pid: string; display_pid?: string }) => ({
			pid: r.pid,
			display: r.display_pid ?? r.pid
		}));
	} catch {
		return [];
	}
}

export async function speciesThresholds(
	pid: string,
	fetchFn: typeof fetch = fetch
): Promise<{ moistureMin: number; moistureMax: number } | null> {
	try {
		const res = await fetchFn(`${BASE}/detail/${encodeURIComponent(pid)}`, { headers: headers() });
		if (!res.ok) return null;
		const data = await res.json();
		if (typeof data.min_soil_moist !== 'number' || typeof data.max_soil_moist !== 'number') return null;
		return { moistureMin: data.min_soil_moist, moistureMax: data.max_soil_moist };
	} catch {
		return null;
	}
}
```

Note: tests inject `fetchFn`, and `speciesThresholds` doesn't gate on the API key (header is just empty) — the `searchSpecies` empty-key early-return is why the "maps OpenPlantbook fields" test works without env. Sign up at https://open.plantbook.io → API keys → put key in `.env` as `OPENPLANTBOOK_API_KEY`.

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: category presets and OpenPlantbook species thresholds with fallback"
```

---

### Task 6: Auth (single password + signed cookie)

**Files:**
- Create: `src/lib/server/auth.ts`, `src/routes/login/+page.svelte`, `src/routes/login/+page.server.ts`
- Modify: `src/hooks.server.ts`

**Interfaces:**
- Produces: `sessionToken(): string`, `isAuthed(cookieValue: string | undefined): boolean`. Guard in `hooks.server.ts` redirects all non-`/login` routes when unauthenticated.

- [ ] **Step 1: Implement auth helpers**

`src/lib/server/auth.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export function sessionToken(): string {
	return createHmac('sha256', env.AUTH_SECRET).update('plant-monitor-session-v1').digest('hex');
}

export function isAuthed(cookieValue: string | undefined): boolean {
	if (!cookieValue) return false;
	const expected = Buffer.from(sessionToken());
	const actual = Buffer.from(cookieValue);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

- [ ] **Step 2: Login route**

`src/routes/login/+page.server.ts`:

```ts
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sessionToken } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		if (form.get('password') !== env.APP_PASSWORD) return fail(401, { wrong: true });
		cookies.set('session', sessionToken(), {
			path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 365
		});
		redirect(303, '/');
	}
};
```

`src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
	let { form } = $props();
</script>

<form method="POST" class="mx-auto mt-24 flex max-w-xs flex-col gap-3">
	<h1 class="text-xl font-semibold">🌱 Plant Monitor</h1>
	<input name="password" type="password" placeholder="Password" required
		class="rounded border p-2" />
	{#if form?.wrong}<p class="text-sm text-red-600">Wrong password</p>{/if}
	<button class="rounded bg-green-700 p-2 text-white">Log in</button>
</form>
```

- [ ] **Step 3: Guard in hooks**

`src/hooks.server.ts` (full file — replaces Task 4 version):

```ts
import { redirect, type Handle } from '@sveltejs/kit';
import { startMqtt } from '$lib/server/mqtt';
import { isAuthed } from '$lib/server/auth';

startMqtt();

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const open = path === '/login' || path.startsWith('/manifest') || path === '/service-worker.js';
	if (!open && !isAuthed(event.cookies.get('session'))) redirect(303, '/login');
	return resolve(event);
};
```

- [ ] **Step 4: Verify manually**

```bash
pnpm dev
```

Visit http://localhost:5173 → redirected to /login; wrong password shows error; right password (from `.env` `APP_PASSWORD`) lands on `/`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: single-password auth with signed session cookie"
```

---

### Task 7: Registration flow (unclaimed devices → claim → plant)

**Files:**
- Create: `src/routes/api/species/+server.ts`, `src/routes/claim/[sensorId]/+page.server.ts`, `src/routes/claim/[sensorId]/+page.svelte`, `src/routes/+page.server.ts`
- Create: `src/routes/+page.svelte` (minimal version; Task 10 makes it pretty)

**Interfaces:**
- Consumes: `PRESETS`, `searchSpecies`, `speciesThresholds` (Task 5); tables (Task 2).
- Produces: dashboard load returns `{ plants, unclaimed }`; claim action creates a `plants` row.

- [ ] **Step 1: Species search proxy**

`src/routes/api/species/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import { searchSpecies } from '$lib/server/thresholds';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	return json(q.length < 2 ? [] : await searchSpecies(q));
};
```

- [ ] **Step 2: Dashboard load (minimal)**

`src/routes/+page.server.ts`:

```ts
import { desc, eq, isNull } from 'drizzle-orm';
import { db, sensors, plants, readings } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const claimed = await db
		.select({
			plant: plants,
			sensor: sensors
		})
		.from(plants)
		.innerJoin(sensors, eq(plants.sensorId, sensors.id));

	const withLatest = await Promise.all(
		claimed.map(async (row) => {
			const [latest] = await db
				.select()
				.from(readings)
				.where(eq(readings.sensorId, row.sensor.id))
				.orderBy(desc(readings.recordedAt))
				.limit(1);
			return { ...row, latest: latest ?? null };
		})
	);

	const unclaimed = await db
		.select()
		.from(sensors)
		.leftJoin(plants, eq(plants.sensorId, sensors.id))
		.where(isNull(plants.id));

	return { plants: withLatest, unclaimed: unclaimed.map((u) => u.sensors) };
};
```

`src/routes/+page.svelte` (minimal; replaced in Task 10):

```svelte
<script lang="ts">
	let { data } = $props();
</script>

<h1 class="text-xl font-semibold">Plants</h1>
{#each data.plants as { plant, latest }}
	<p><a href="/plants/{plant.id}">{plant.name}</a> — moisture {latest?.moisture ?? '–'}%</p>
{/each}
<h2 class="mt-6 font-semibold">Unclaimed sensors</h2>
{#each data.unclaimed as s}
	<p><a class="underline" href="/claim/{s.id}">{s.mac}</a> (last seen {s.lastSeenAt})</p>
{/each}
```

- [ ] **Step 3: Claim page**

`src/routes/claim/[sensorId]/+page.server.ts`:

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, sensors, plants } from '$lib/server/db';
import { PRESETS, speciesThresholds } from '$lib/server/thresholds';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [sensor] = await db.select().from(sensors).where(eq(sensors.id, Number(params.sensorId)));
	if (!sensor) error(404, 'No such sensor');
	return { sensor, presets: PRESETS };
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Name required' });

		const speciesPid = String(form.get('speciesPid') ?? '');
		const preset = String(form.get('preset') ?? 'general') as keyof typeof PRESETS;
		const manualMin = form.get('moistureMin');
		const manualMax = form.get('moistureMax');

		let thresholds: { moistureMin: number; moistureMax: number } | null = null;
		let source = 'preset';
		if (speciesPid) {
			thresholds = await speciesThresholds(speciesPid);
			if (thresholds) source = 'openplantbook';
		}
		thresholds ??= PRESETS[preset] ?? PRESETS.general;
		if (manualMin && manualMax) {
			thresholds = { moistureMin: Number(manualMin), moistureMax: Number(manualMax) };
			source = 'manual';
		}

		await db.insert(plants).values({
			sensorId: Number(params.sensorId),
			name,
			species: speciesPid || null,
			sunlightNotes: String(form.get('sunlightNotes') ?? '') || null,
			moistureMin: thresholds.moistureMin,
			moistureMax: thresholds.moistureMax,
			thresholdSource: source
		});
		redirect(303, '/');
	}
};
```

`src/routes/claim/[sensorId]/+page.svelte`:

```svelte
<script lang="ts">
	let { data, form } = $props();
	let query = $state('');
	let results = $state<{ pid: string; display: string }[]>([]);
	let chosen = $state<{ pid: string; display: string } | null>(null);
	let timer: ReturnType<typeof setTimeout>;

	function search() {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			results = query.length >= 2 ? await (await fetch(`/api/species?q=${encodeURIComponent(query)}`)).json() : [];
		}, 300);
	}
</script>

<h1 class="text-xl font-semibold">Claim sensor {data.sensor.mac}</h1>
<form method="POST" class="mt-4 flex flex-col gap-3">
	<input name="name" placeholder="Plant name (e.g. Kitchen monstera)" required class="rounded border p-2" />
	<input name="sunlightNotes" placeholder="Sunlight / location notes" class="rounded border p-2" />

	<label class="text-sm font-medium">Species (optional — sets thresholds automatically)</label>
	<input bind:value={query} oninput={search} placeholder="Search species…" class="rounded border p-2" />
	{#each results as r}
		<button type="button" class="text-left text-sm underline"
			onclick={() => { chosen = r; query = r.display; results = []; }}>{r.display}</button>
	{/each}
	<input type="hidden" name="speciesPid" value={chosen?.pid ?? ''} />

	<label class="text-sm font-medium">Fallback preset</label>
	<select name="preset" class="rounded border p-2">
		{#each Object.keys(data.presets) as p}<option value={p}>{p}</option>{/each}
	</select>

	<details>
		<summary class="text-sm">Manual thresholds (override)</summary>
		<div class="mt-2 flex gap-2">
			<input name="moistureMin" type="number" min="0" max="100" placeholder="min %" class="w-24 rounded border p-2" />
			<input name="moistureMax" type="number" min="0" max="100" placeholder="max %" class="w-24 rounded border p-2" />
		</div>
	</details>

	{#if form?.message}<p class="text-sm text-red-600">{form.message}</p>{/if}
	<button class="rounded bg-green-700 p-2 text-white">Create plant</button>
</form>
```

- [ ] **Step 4: Verify manually**

```bash
pnpm dev   # with fake data from Task 4 in the DB
```

Dashboard shows 2 unclaimed sensors → claim one with species "monstera" (needs `OPENPLANTBOOK_API_KEY` set; without it, preset path) → plant appears on dashboard with moisture from latest reading. Check DB: `select name, moisture_min, threshold_source from plants;` — `openplantbook` source when species chosen, else `preset`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: claim flow with species lookup and preset/manual thresholds"
```

---

### Task 8: Alert engine (TDD)

**Files:**
- Create: `src/lib/server/alerts.ts`
- Test: `tests/alerts.test.ts`

**Interfaces:**
- Consumes: tables (Task 2), `sendPushToAll` (Task 9 — this task defines the alert rows + decision logic and calls a `notify` callback so it tests without push).
- Produces:
  - `evaluateSensor(input: { moistureMin: number; latest: { moisture: number | null; recordedAt: Date } | null; battery: number | null; lastSeenAt: Date | null; now: Date }): AlertType[]` where `AlertType = 'low_moisture' | 'low_battery' | 'sensor_silent'`
  - `alertDecision(existing: { lastNotifiedAt: Date | null } | null, breached: boolean, now: Date): 'open' | 'renotify' | 'none' | 'resolve'`
  - `runEvaluation(notify: (title: string, body: string) => Promise<void>, now?: Date): Promise<void>` — glue used by scheduler (Task 9).

Constants: battery < 15, silent > 36h, re-notify ≥ 24h.

- [ ] **Step 1: Write failing tests**

`tests/alerts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateSensor, alertDecision } from '../src/lib/server/alerts';

const now = new Date('2026-07-20T12:00:00Z');
const h = (n: number) => new Date(now.getTime() - n * 3600_000);

describe('evaluateSensor', () => {
	const base = { moistureMin: 25, battery: 80 as number | null, lastSeenAt: h(1), now };
	it('flags low moisture', () => {
		expect(evaluateSensor({ ...base, latest: { moisture: 12, recordedAt: h(1) } }))
			.toContain('low_moisture');
	});
	it('no alert at/above threshold', () => {
		expect(evaluateSensor({ ...base, latest: { moisture: 25, recordedAt: h(1) } })).toEqual([]);
	});
	it('flags low battery under 15%', () => {
		expect(evaluateSensor({ ...base, battery: 14, latest: { moisture: 40, recordedAt: h(1) } }))
			.toContain('low_battery');
	});
	it('null battery never alerts (HHCCJCY01 has no passive battery)', () => {
		expect(evaluateSensor({ ...base, battery: null, latest: { moisture: 40, recordedAt: h(1) } }))
			.toEqual([]);
	});
	it('flags silence over 36h and suppresses stale moisture alerts', () => {
		const r = evaluateSensor({ ...base, lastSeenAt: h(37), latest: { moisture: 5, recordedAt: h(37) } });
		expect(r).toEqual(['sensor_silent']);
	});
	it('flags silence when never seen', () => {
		expect(evaluateSensor({ ...base, lastSeenAt: null, latest: null })).toEqual(['sensor_silent']);
	});
});

describe('alertDecision', () => {
	it('opens on new breach', () => expect(alertDecision(null, true, now)).toBe('open'));
	it('renotifies after 24h', () =>
		expect(alertDecision({ lastNotifiedAt: h(25) }, true, now)).toBe('renotify'));
	it('stays quiet within 24h', () =>
		expect(alertDecision({ lastNotifiedAt: h(23) }, true, now)).toBe('none'));
	it('resolves when breach clears', () =>
		expect(alertDecision({ lastNotifiedAt: h(1) }, false, now)).toBe('resolve'));
	it('no-ops when nothing open and nothing breached', () =>
		expect(alertDecision(null, false, now)).toBe('none'));
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `pnpm test`
Expected: FAIL — cannot resolve `alerts`.

- [ ] **Step 3: Implement**

`src/lib/server/alerts.ts`:

```ts
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, sensors, plants, readings, alerts } from './db';

export type AlertType = 'low_moisture' | 'low_battery' | 'sensor_silent';

const BATTERY_MIN = 15;
const SILENT_MS = 36 * 3600_000;
const RENOTIFY_MS = 24 * 3600_000;

export function evaluateSensor(input: {
	moistureMin: number;
	latest: { moisture: number | null; recordedAt: Date } | null;
	battery: number | null;
	lastSeenAt: Date | null;
	now: Date;
}): AlertType[] {
	const { moistureMin, latest, battery, lastSeenAt, now } = input;
	if (!lastSeenAt || now.getTime() - lastSeenAt.getTime() > SILENT_MS) return ['sensor_silent'];
	const out: AlertType[] = [];
	if (latest?.moisture != null && latest.moisture < moistureMin) out.push('low_moisture');
	if (battery != null && battery < BATTERY_MIN) out.push('low_battery');
	return out;
}

export function alertDecision(
	existing: { lastNotifiedAt: Date | null } | null,
	breached: boolean,
	now: Date
): 'open' | 'renotify' | 'none' | 'resolve' {
	if (breached && !existing) return 'open';
	if (!breached && existing) return 'resolve';
	if (breached && existing) {
		const last = existing.lastNotifiedAt?.getTime() ?? 0;
		return now.getTime() - last >= RENOTIFY_MS ? 'renotify' : 'none';
	}
	return 'none';
}

const MESSAGES: Record<AlertType, (plant: string) => { title: string; body: string }> = {
	low_moisture: (p) => ({ title: `💧 ${p} needs water`, body: 'Soil moisture is below its minimum.' }),
	low_battery: (p) => ({ title: `🔋 ${p}'s sensor battery is low`, body: 'Replace the CR2032 soon.' }),
	sensor_silent: (p) => ({ title: `📡 ${p}'s sensor is silent`, body: 'No readings for over 36 hours — check the sensor and hub.' })
};

const ALL_TYPES: AlertType[] = ['low_moisture', 'low_battery', 'sensor_silent'];

export async function runEvaluation(
	notify: (title: string, body: string) => Promise<void>,
	now = new Date()
): Promise<void> {
	const rows = await db
		.select({ plant: plants, sensor: sensors })
		.from(plants)
		.innerJoin(sensors, eq(plants.sensorId, sensors.id));

	for (const { plant, sensor } of rows) {
		const [latest] = await db
			.select({ moisture: readings.moisture, recordedAt: readings.recordedAt })
			.from(readings)
			.where(eq(readings.sensorId, sensor.id))
			.orderBy(desc(readings.recordedAt))
			.limit(1);

		const active = evaluateSensor({
			moistureMin: plant.moistureMin,
			latest: latest ?? null,
			battery: sensor.battery,
			lastSeenAt: sensor.lastSeenAt,
			now
		});

		for (const type of ALL_TYPES) {
			const [existing] = await db
				.select()
				.from(alerts)
				.where(and(eq(alerts.sensorId, sensor.id), eq(alerts.type, type), isNull(alerts.resolvedAt)));

			const decision = alertDecision(existing ?? null, active.includes(type), now);
			if (decision === 'none') continue;

			if (decision === 'resolve') {
				await db.update(alerts).set({ resolvedAt: now }).where(eq(alerts.id, existing.id));
				continue;
			}

			const { title, body } = MESSAGES[type](plant.name);
			await notify(title, body);
			if (decision === 'open') {
				await db.insert(alerts).values({ sensorId: sensor.id, plantId: plant.id, type, lastNotifiedAt: now });
			} else {
				await db.update(alerts).set({ lastNotifiedAt: now }).where(eq(alerts.id, existing.id));
			}
		}
	}
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: alert evaluation engine with open/renotify/resolve lifecycle"
```

---

### Task 9: Web Push + scheduler

**Files:**
- Create: `src/lib/server/push.ts`, `src/lib/server/scheduler.ts`, `src/routes/api/push/+server.ts`, `src/service-worker.js`, `static/manifest.webmanifest`
- Modify: `src/hooks.server.ts`, `src/routes/+layout.svelte`, `src/app.html`

**Interfaces:**
- Consumes: `runEvaluation(notify)` (Task 8), `pushSubscriptions` table (Task 2).
- Produces: `sendPushToAll(title: string, body: string): Promise<void>`; `startScheduler(): void`.

- [ ] **Step 1: Generate VAPID keys**

```bash
npx web-push generate-vapid-keys
```

Put output in `.env` as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.

- [ ] **Step 2: Push sender with pruning**

`src/lib/server/push.ts`:

```ts
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db, pushSubscriptions } from './db';

let configured = false;
function configure() {
	if (configured || !env.VAPID_PUBLIC_KEY) return configured;
	webpush.setVapidDetails('mailto:kyle@kittoffices.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
	return (configured = true);
}

export async function sendPushToAll(title: string, body: string): Promise<void> {
	if (!configure()) return;
	const subs = await db.select().from(pushSubscriptions);
	for (const sub of subs) {
		try {
			await webpush.sendNotification(
				sub.subscription as webpush.PushSubscription,
				JSON.stringify({ title, body })
			);
		} catch (e) {
			const status = (e as { statusCode?: number }).statusCode;
			if (status === 404 || status === 410) {
				await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
			} else {
				console.error('[push] send failed', e);
			}
		}
	}
}
```

- [ ] **Step 3: Subscription endpoint + service worker + manifest + registration**

`src/routes/api/push/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import { db, pushSubscriptions } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json({ key: env.VAPID_PUBLIC_KEY ?? '' });

export const POST: RequestHandler = async ({ request }) => {
	await db.insert(pushSubscriptions).values({ subscription: await request.json() });
	return json({ ok: true });
};
```

`src/service-worker.js`:

```js
self.addEventListener('push', (event) => {
	const { title, body } = event.data?.json() ?? { title: 'Plant Monitor', body: '' };
	event.waitUntil(self.registration.showNotification(title, { body, icon: '/favicon.png' }));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(self.clients.openWindow('/'));
});
```

`static/manifest.webmanifest`:

```json
{
	"name": "Plant Monitor",
	"short_name": "Plants",
	"start_url": "/",
	"display": "standalone",
	"background_color": "#ffffff",
	"theme_color": "#15803d",
	"icons": [{ "src": "/favicon.png", "sizes": "512x512", "type": "image/png" }]
}
```

In `src/app.html` `<head>`, add: `<link rel="manifest" href="/manifest.webmanifest" />`

Append to `src/routes/+layout.svelte` script (registration + subscribe button wiring):

```svelte
<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	let { children } = $props();
	let pushState = $state<'unsupported' | 'off' | 'on'>('unsupported');

	onMount(async () => {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
		const reg = await navigator.serviceWorker.register('/service-worker.js');
		pushState = (await reg.pushManager.getSubscription()) ? 'on' : 'off';
	});

	async function enablePush() {
		const reg = await navigator.serviceWorker.ready;
		const { key } = await (await fetch('/api/push')).json();
		const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
		await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) });
		pushState = 'on';
	}
</script>

<main class="mx-auto max-w-2xl p-4">
	{#if pushState === 'off'}
		<button onclick={enablePush} class="mb-4 w-full rounded bg-green-100 p-2 text-sm text-green-900">
			🔔 Enable watering alerts on this device
		</button>
	{/if}
	{@render children()}
</main>
```

- [ ] **Step 4: Scheduler**

`src/lib/server/scheduler.ts`:

```ts
import { runEvaluation } from './alerts';
import { sendPushToAll } from './push';

const TWELVE_H = 12 * 3600_000;
const g = globalThis as { __plantScheduler?: ReturnType<typeof setInterval> };

export function startScheduler(): void {
	if (g.__plantScheduler) return;
	const run = () =>
		runEvaluation(sendPushToAll).catch((e) => console.error('[scheduler] evaluation failed', e));
	setTimeout(run, 30_000); // first pass shortly after boot
	g.__plantScheduler = setInterval(run, TWELVE_H);
}
```

Add to `src/hooks.server.ts` after `startMqtt();`:

```ts
import { startScheduler } from '$lib/server/scheduler';
startScheduler();
```

- [ ] **Step 5: Verify end-to-end + commit**

```bash
pnpm test        # all pure-logic tests still pass
pnpm dev
```

In the browser: enable push (accept permission). Then force a drought:

```bash
pnpm fake 5      # moisture 5% < any preset min
```

Wait ~30s for the boot evaluation (restart `pnpm dev` to trigger it) → notification "💧 <plant> needs water" appears. Check `select type, last_notified_at from alerts;` → one open `low_moisture` row. Run `pnpm fake 60`, restart dev server, wait 30s → alert row gains `resolved_at`.

```bash
git add -A && git commit -m "feat: web push notifications and 12h evaluation scheduler"
```

---

### Task 10: Dashboard UI

**Files:**
- Modify: `src/routes/+page.svelte`, `src/routes/+page.server.ts`
- Create: `src/routes/plants/[id]/+page.svelte`, `src/routes/plants/[id]/+page.server.ts`, `src/lib/Sparkline.svelte`

**Interfaces:**
- Consumes: load data from Task 7; `readings`/`alerts` tables.
- Produces: plant cards with moisture/light/battery/last-seen + sparkline; plant detail page with 7-day history, threshold editing, alert log.

Note for executor: before writing `Sparkline.svelte`, invoke the `dataviz` skill (it triggers on sparklines) and follow its mark spec; keep the component a single muted-color polyline, no axes.

- [ ] **Step 1: Extend dashboard load with history + open alerts**

Add to the `withLatest` mapping in `src/routes/+page.server.ts` (inside the `Promise.all` callback, after `latest`):

```ts
const history = await db
	.select({ moisture: readings.moisture, recordedAt: readings.recordedAt })
	.from(readings)
	.where(eq(readings.sensorId, row.sensor.id))
	.orderBy(desc(readings.recordedAt))
	.limit(84); // 7 days of hourly-ish readings
const [openAlert] = await db
	.select()
	.from(alerts)
	.where(and(eq(alerts.sensorId, row.sensor.id), isNull(alerts.resolvedAt)))
	.limit(1);
return { ...row, latest: latest ?? null, history: history.reverse(), openAlert: openAlert ?? null };
```

(Imports: add `alerts`, `and`, `isNull`.)

- [ ] **Step 2: Sparkline component**

`src/lib/Sparkline.svelte`:

```svelte
<script lang="ts">
	let { points, min }: { points: { moisture: number | null; recordedAt: Date }[]; min: number } = $props();
	const W = 120, H = 32;
	const vals = $derived(points.filter((p) => p.moisture != null) as { moisture: number }[]);
	const path = $derived(
		vals.length < 2 ? '' :
		vals.map((p, i) =>
			`${(i / (vals.length - 1)) * W},${H - (Math.min(p.moisture, 100) / 100) * H}`
		).join(' ')
	);
	const minY = $derived(H - (min / 100) * H);
</script>

{#if path}
	<svg viewBox="0 0 {W} {H}" class="h-8 w-30" role="img" aria-label="moisture history">
		<line x1="0" y1={minY} x2={W} y2={minY} stroke="currentColor" stroke-dasharray="2 2" class="text-red-300" />
		<polyline points={path} fill="none" stroke="currentColor" stroke-width="1.5" class="text-green-700" />
	</svg>
{/if}
```

- [ ] **Step 3: Dashboard page**

`src/routes/+page.svelte` (full replacement):

```svelte
<script lang="ts">
	import Sparkline from '$lib/Sparkline.svelte';
	let { data } = $props();
	const ago = (d: Date | string | null) => {
		if (!d) return 'never';
		const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
		return mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
	};
</script>

<h1 class="mb-4 text-xl font-semibold">🌱 Plants</h1>

<div class="flex flex-col gap-3">
	{#each data.plants as { plant, sensor, latest, history, openAlert }}
		<a href="/plants/{plant.id}"
			class="rounded-lg border p-3 {openAlert ? 'border-red-400 bg-red-50' : ''}">
			<div class="flex items-center justify-between">
				<div>
					<p class="font-medium">{plant.name}</p>
					<p class="text-sm text-gray-500">
						💧 {latest?.moisture ?? '–'}% (min {plant.moistureMin}) · ☀️ {latest?.lux ?? '–'} lx
						{#if sensor.battery != null}· 🔋 {sensor.battery}%{/if}
						· seen {ago(sensor.lastSeenAt)}
					</p>
					{#if openAlert}<p class="text-sm font-medium text-red-700">⚠ {openAlert.type.replaceAll('_', ' ')}</p>{/if}
				</div>
				<Sparkline points={history} min={plant.moistureMin} />
			</div>
		</a>
	{/each}
	{#if data.plants.length === 0}<p class="text-gray-500">No plants yet — claim a sensor below.</p>{/if}
</div>

{#if data.unclaimed.length}
	<h2 class="mt-8 mb-2 font-semibold">Unclaimed sensors</h2>
	{#each data.unclaimed as s}
		<a class="block text-sm underline" href="/claim/{s.id}">{s.mac} — seen {ago(s.lastSeenAt)}</a>
	{/each}
{/if}
```

- [ ] **Step 4: Plant detail page (history, edit thresholds, alert log)**

`src/routes/plants/[id]/+page.server.ts`:

```ts
import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db, plants, sensors, readings, alerts } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [row] = await db
		.select({ plant: plants, sensor: sensors })
		.from(plants)
		.innerJoin(sensors, eq(plants.sensorId, sensors.id))
		.where(eq(plants.id, Number(params.id)));
	if (!row) error(404, 'No such plant');

	const weekAgo = new Date(Date.now() - 7 * 86400_000);
	const history = await db
		.select()
		.from(readings)
		.where(and(eq(readings.sensorId, row.sensor.id), gte(readings.recordedAt, weekAgo)))
		.orderBy(readings.recordedAt);
	const alertLog = await db
		.select()
		.from(alerts)
		.where(eq(alerts.sensorId, row.sensor.id))
		.orderBy(desc(alerts.createdAt))
		.limit(20);
	return { ...row, history, alertLog };
};

export const actions: Actions = {
	thresholds: async ({ request, params }) => {
		const form = await request.formData();
		await db
			.update(plants)
			.set({
				moistureMin: Number(form.get('moistureMin')),
				moistureMax: Number(form.get('moistureMax')),
				thresholdSource: 'manual'
			})
			.where(eq(plants.id, Number(params.id)));
		redirect(303, `/plants/${params.id}`);
	},
	unclaim: async ({ params }) => {
		const id = Number(params.id);
		const [plant] = await db.select().from(plants).where(eq(plants.id, id));
		if (plant) {
			await db.update(alerts).set({ resolvedAt: new Date() }).where(eq(alerts.plantId, id));
			await db.delete(plants).where(eq(plants.id, id));
		}
		redirect(303, '/');
	}
};
```

`src/routes/plants/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import Sparkline from '$lib/Sparkline.svelte';
	let { data } = $props();
</script>

<a href="/" class="text-sm text-gray-500">← back</a>
<h1 class="mb-1 text-xl font-semibold">{data.plant.name}</h1>
<p class="text-sm text-gray-500">
	{data.plant.species ?? 'no species set'} · sensor {data.sensor.mac} · thresholds via {data.plant.thresholdSource}
</p>
{#if data.plant.sunlightNotes}<p class="text-sm">☀️ {data.plant.sunlightNotes}</p>{/if}

<h2 class="mt-6 mb-1 font-semibold">Last 7 days</h2>
<Sparkline points={data.history} min={data.plant.moistureMin} />

<h2 class="mt-6 mb-1 font-semibold">Thresholds</h2>
<form method="POST" action="?/thresholds" class="flex items-end gap-2">
	<label class="text-sm">min %<input name="moistureMin" type="number" value={data.plant.moistureMin} class="block w-20 rounded border p-1" /></label>
	<label class="text-sm">max %<input name="moistureMax" type="number" value={data.plant.moistureMax} class="block w-20 rounded border p-1" /></label>
	<button class="rounded bg-green-700 px-3 py-1 text-white">Save</button>
</form>

<h2 class="mt-6 mb-1 font-semibold">Alerts</h2>
{#each data.alertLog as a}
	<p class="text-sm">
		{a.type.replaceAll('_', ' ')} — opened {new Date(a.createdAt).toLocaleString()}
		{a.resolvedAt ? `· resolved ${new Date(a.resolvedAt).toLocaleString()}` : '· open'}
	</p>
{:else}
	<p class="text-sm text-gray-500">None yet 🎉</p>
{/each}

<form method="POST" action="?/unclaim" class="mt-8">
	<button class="text-sm text-red-600 underline">Unclaim sensor (deletes plant)</button>
</form>
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm dev
```

Dashboard shows cards with sparkline and red highlight on the alerting plant (`pnpm fake 5` + restart to re-trigger). Plant page edits thresholds (source flips to `manual`), unclaim returns the sensor to the unclaimed list.

```bash
git add -A && git commit -m "feat: dashboard and plant detail UI with sparklines and alert log"
```

---

### Task 11: Deploy + hardware runbook

**Files:**
- Create: `docs/hardware-setup.md`, `README.md`

**Interfaces:**
- Consumes: everything; no code changes except deploy config.

- [ ] **Step 1: Deploy to Railway (manual)**

1. `railway init` (or Railway dashboard → New Project → Deploy from repo after pushing to GitHub).
2. Add Postgres plugin; Railway injects `DATABASE_URL`.
3. Set env vars from `.env` (all except `DATABASE_URL`): `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `APP_PASSWORD`, `AUTH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `OPENPLANTBOOK_API_KEY`.
4. Build command `pnpm build`, start command `node build`. Run `pnpm db:push` once against the Railway `DATABASE_URL` (`DATABASE_URL=<railway-url> pnpm db:push`).
5. Open the public URL on your phone → log in → Share → Add to Home Screen → open from home screen → enable push. Run the fake publisher with moisture 5 → phone notification.

- [ ] **Step 2: Write the hardware runbook**

`docs/hardware-setup.md`:

```markdown
# Hardware bring-up

## 1. Flash the ESP32 with OpenMQTTGateway
1. Connect the ESP32 to your Mac with a **data** micro-USB cable.
2. In Chrome, open https://docs.openmqttgateway.com/upload/web-install.html
3. Pick **esp32dev-ble** → Connect → select the serial port (install the CP210x driver if no port appears) → Install.
4. When it reboots, connect to the `OpenMQTTGateway` WiFi AP it broadcasts, open 192.168.4.1, and enter:
   - your WiFi SSID + password
   - MQTT server: your HiveMQ host (no `mqtts://` prefix), port **8883**, TLS **enabled**
   - MQTT user/password: the HiveMQ credentials from `.env`
   - Base topic: leave default (`home/`)
5. The gateway appears at `home/<gateway-name>/LWT` = `online` (watch in HiveMQ web client).

## 2. Sensors
1. Pull the plastic battery tab / insert CR2032 (flat side up).
2. Within ~1 minute the app's dashboard shows the sensor MAC under **Unclaimed sensors** — no pairing needed.
3. Claim it, pick the species, stick the probe in the soil (light window up, top above soil).

## 3. Sanity checks
- Sensor in dry air → moisture ≤ ~5%; in a glass of water → 60%+.
- `sensor_silent` alert fires if the hub loses power >36h — that's the "check the hub" signal.

## 4. Battery notes
- HHCCJCY01 (white, classic) does not broadcast battery; the app shows 🔋 only if the sensor reports it (HHCCJCY10 does). A dead battery shows up as `sensor_silent`.
- Battery life ≈ 1 year. Spares live in the kitchen drawer.
```

- [ ] **Step 3: README**

`README.md`:

```markdown
# 🌱 Plant Monitor

BLE plant sensors (HHCC Flower Care) → ESP32 running OpenMQTTGateway → HiveMQ Cloud → this SvelteKit app (Railway) → Web Push when a plant needs water.

## Dev
    docker compose up -d      # local Postgres
    cp .env.example .env      # fill in secrets
    pnpm install && pnpm db:push
    pnpm dev
    pnpm fake 5               # simulate thirsty sensors (needs MQTT_* env)
    pnpm test

## Docs
- Spec: docs/superpowers/specs/2026-07-12-plant-monitor-design.md
- Plan: docs/superpowers/plans/2026-07-20-plant-monitor.md
- Hardware: docs/hardware-setup.md
```

- [ ] **Step 4: Verify deployed app end-to-end**

Phone: installed PWA receives a push from `pnpm fake 5` (pointing at HiveMQ, with the Railway app subscribed). This is the pre-hardware full-system proof.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: deploy runbook, hardware bring-up guide, README"
```
