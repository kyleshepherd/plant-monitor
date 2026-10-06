import type { MqttClient } from 'mqtt';
import { lastSensorHeardAt } from './ingest';

// OpenMQTTGateway's BLE scan can freeze after days of uptime: the gateway stays
// online and connected to the broker but stops forwarding broadcasts. Sensors
// advertise every minute, so silence across ALL of them means the hub, not the
// sensors — reboot it over MQTT, retrying periodically if that doesn't help.
const QUIET_MS = 2 * 3600_000;
const RETRY_MS = 6 * 3600_000;
const CHECK_MS = 5 * 60_000;

export function shouldRestart(
	lastHeardAt: number,
	lastRestartAt: number | null,
	now: number
): boolean {
	if (now - lastHeardAt < QUIET_MS) return false;
	return lastRestartAt === null || now - lastRestartAt >= RETRY_MS;
}

export function startGatewayWatchdog(
	client: MqttClient,
	gatewayTopic: string,
	notify: (title: string, body: string) => Promise<void>
): void {
	let lastRestartAt: number | null = null;
	setInterval(() => {
		const now = Date.now();
		if (!client.connected || !shouldRestart(lastSensorHeardAt(), lastRestartAt, now)) return;
		lastRestartAt = now;
		const quietMins = Math.round((now - lastSensorHeardAt()) / 60_000);
		console.warn(`[watchdog] no sensor broadcasts for ${quietMins} min — restarting gateway`);
		client.publish(`${gatewayTopic}/commands/MQTTtoSYS/config`, JSON.stringify({ cmd: 'restart' }));
		notify(
			'🔄 Plant hub restarted',
			`No sensor readings for ${Math.round(quietMins / 60)}h — rebooted the gateway.`
		).catch((e) => console.error('[watchdog] notify failed', e));
	}, CHECK_MS);
}
