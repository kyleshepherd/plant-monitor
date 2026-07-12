# Plant Moisture Monitor — Design

**Date:** 2026-07-12
**Status:** Approved

## Summary

A personal plant-monitoring system. BLE soil sensors (Xiaomi MiFlora) sit in plant pots and broadcast moisture, light, temperature, conductivity, and battery level. An ESP32 hub running OpenMQTTGateway relays those broadcasts to an MQTT broker. A single SvelteKit PWA ingests the readings, evaluates them twice daily against per-plant thresholds, and sends Web Push notifications when a plant needs water, a sensor battery is low, or a sensor goes silent.

## Goals

- Register a sensor unit in the app against a specific plant (species, sunlight/location notes).
- Unattended reporting: readings reach the backend without a phone nearby.
- Alert when moisture drops below the suggested level for that plant's species.
- Low-battery alerts for sensor units.
- Cheap: ~£12–15 per plant, ~£8 one-off for the hub, £0/month beyond existing Railway usage.

## Non-goals

- No native mobile app (the PWA covers alerts and dashboard).
- No automatic watering.
- No custom sensor hardware or firmware.
- No multi-user/multi-home support — single user, single hub.

## Hardware

| Piece | Choice | Cost | Notes |
|---|---|---|---|
| Soil sensor (per plant) | Xiaomi MiFlora / HHCC clone (HHCCJCY01) | ~£10–15 | BLE broadcast: moisture %, light (lux), temp, conductivity, battery %. ~1 year on a swappable CR2032. Sealed and plant-safe. |
| Hub (one-off) | ESP32 dev board + OpenMQTTGateway firmware | ~£5–8 | Prebuilt open-source firmware; web-flashable. Passively decodes MiFlora BLE broadcasts and publishes JSON to MQTT, keyed by sensor MAC address. No embedded coding. |

Battery is swappable rather than rechargeable — accepted trade-off for sealed, purpose-built hardware with ~1-year life and battery % reporting.

## Infrastructure

- **MQTT broker:** HiveMQ Cloud free tier. TLS and username/password auth out of the box; OpenMQTTGateway connects to it directly. No broker to maintain.
- **App:** one SvelteKit app deployed on Railway as a long-lived Node server (adapter-node). Because the process is persistent, it holds the MQTT client subscription and the in-process scheduler — no separate worker service.
- **Database:** Postgres on Railway, accessed via Drizzle ORM.

## Data model

- `sensors` — MAC address (unique), friendly name, claimed/unclaimed, last_seen_at, latest battery %.
- `plants` — name, species, optional photo, sunlight/location notes, moisture_min, moisture_max, threshold_source (openplantbook | preset | manual), FK → sensor.
- `readings` — FK → sensor, moisture, light, temperature, conductivity, battery, recorded_at. At most one stored row per sensor per hour.
- `alerts` — FK → plant or sensor, type (low_moisture | low_battery | sensor_silent), created_at, resolved_at, last_notified_at.
- `push_subscriptions` — Web Push subscription JSON per installed PWA instance.

## Data flow

1. MiFloras broadcast continuously; the ESP32 hub publishes decoded readings to MQTT every few minutes.
2. The SvelteKit server's MQTT client (started from `hooks.server.ts`) ingests messages. Readings for a sensor are persisted at most once per hour; extras are discarded.
3. Unknown MAC addresses are upserted into `sensors` as unclaimed — this is how new devices appear in the app.
4. An in-process scheduler runs the evaluation twice daily (every 12h):
   - **Low moisture:** latest reading below the plant's `moisture_min`.
   - **Low battery:** battery below 15%.
   - **Sensor silent:** no reading for over 36h (covers dead sensor, dead hub, or broker outage).
5. A breach creates an open alert (or re-uses the existing open one) and sends a Web Push notification. Re-notification is throttled to once per 24h per alert. When the condition clears, the alert is marked resolved.

## Registration flow

1. Hub hears a new MiFlora → sensor appears in the app under "Unclaimed devices".
2. User claims it and creates the plant: name, species, sunlight/location notes, optional photo.
3. Threshold resolution, in order:
   1. **OpenPlantbook lookup** by species → min/max soil moisture (the API is built for exactly these sensors).
   2. Not found → user picks a **category preset**: succulent / tropical / fern / herb / general.
   3. Either way the resulting numbers are shown and **manually editable**.

## PWA

- SvelteKit + Tailwind + shadcn-svelte. Installable (manifest + service worker); Web Push via VAPID keys — no third-party push service. Works on iOS 16.4+ home-screen installs, Android, desktop.
- **Dashboard:** plant cards showing current moisture (vs threshold), light, battery, last-seen time; simple history sparkline per plant; alert log; unclaimed-devices section.
- Single user: simple session auth (one account), nothing fancier.

## Error handling

- **Hub offline / sensor dead / broker down:** all manifest as missing readings and are caught by the sensor-silent check.
- **MQTT disconnect:** client auto-reconnects with backoff; MiFlora broadcasts repeat continuously, so gaps lose nothing meaningful.
- **OpenPlantbook unavailable:** registration proceeds via presets; lookup can be retried later.
- **Push failure:** expired subscriptions (HTTP 404/410 from the push service) are deleted; other failures are logged, and the alert row remains open so the next 24h cycle retries.

## Testing

- Unit tests on the real logic: threshold evaluation, alert lifecycle (open → re-notify throttle → resolve), reading downsampling, OpenPlantbook → preset fallback.
- MQTT ingest tested against recorded OpenMQTTGateway payloads.
- End-to-end verified physically: sensor in dry air vs a glass of water.

## Build order (suggested)

1. SvelteKit app skeleton + Postgres/Drizzle schema + auth.
2. MQTT ingest against HiveMQ with a fake publisher script (before hardware arrives).
3. Registration flow + OpenPlantbook/preset thresholds.
4. Evaluation scheduler + alerts + Web Push.
5. Dashboard UI.
6. Flash ESP32 with OpenMQTTGateway, point at HiveMQ, claim real sensors.
