import mqtt from 'mqtt';
import { env } from '$env/dynamic/private';
import { ingest } from './ingest';
import { startGatewayWatchdog } from './watchdog';
import { sendPushToAll } from './push';

let started = false;

export function startMqtt(): void {
	if (started || !env.MQTT_URL) return;
	started = true;

	const client = mqtt.connect(env.MQTT_URL, {
		username: env.MQTT_USERNAME || undefined,
		password: env.MQTT_PASSWORD || undefined,
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

	startGatewayWatchdog(client, env.GATEWAY_TOPIC || 'home/OMG_ESP32_BLE', sendPushToAll);
}
