# 🌱 Plant Monitor

BLE plant sensors (HHCC Flower Care) → ESP32 running OpenMQTTGateway → MQTT → this SvelteKit PWA → Web Push when a plant needs water.

## How it works

- The ESP32 hub passively decodes MiFlora BLE broadcasts and publishes them to MQTT.
- This app (one long-lived Node process) subscribes, stores at most one reading per sensor per hour, and evaluates every plant hourly: moisture below its species threshold, battery under 15%, or sensor silent for 36h → Web Push notification (re-nagged at most daily).
- Thresholds come from OpenPlantbook by species, falling back to category presets, always manually overridable.

## Dev

    docker compose up -d      # local Postgres (:5433) + mosquitto (:1883)
    cp .env.example .env      # fill in secrets (see .env.example comments)
    pnpm install && pnpm db:push
    pnpm dev
    pnpm fake 5               # simulate two thirsty sensors
    pnpm test

Login password is `APP_PASSWORD`. The 12h evaluation also runs ~30s after boot, so restart `pnpm dev` to force an alert check.

## Deploy (Railway)

1. Push to GitHub → Railway → New Project → deploy from repo. Add the Postgres plugin.
2. Set env vars: `MQTT_URL` (`mqtts://<hivemq-host>:8883`), `MQTT_USERNAME`, `MQTT_PASSWORD`, `APP_PASSWORD`, `AUTH_SECRET` (`openssl rand -hex 32`), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`), `OPENPLANTBOOK_API_KEY`.
3. Build `pnpm build`, start `node build`. Apply schema once: `DATABASE_URL=<railway-url> pnpm db:push`.
4. Open the URL on your phone → Add to Home Screen → enable push.

## Docs

- Spec: `docs/superpowers/specs/2026-07-12-plant-monitor-design.md`
- Plan: `docs/superpowers/plans/2026-07-20-plant-monitor.md`
- Hardware bring-up: `docs/hardware-setup.md`
