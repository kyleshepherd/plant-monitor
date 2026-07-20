// Publishes realistic OMG MiFlora payloads so the whole pipeline works pre-hardware.
// Usage: node --env-file=.env scripts/fake-publisher.mjs [moisture]
import mqtt from 'mqtt';

const MACS = ['C4:7C:8D:6D:5E:2F', 'C4:7C:8D:6D:AA:BB'];
const moisture = Number(process.argv[2] ?? 35);

const client = mqtt.connect(process.env.MQTT_URL, {
	username: process.env.MQTT_USERNAME || undefined,
	password: process.env.MQTT_PASSWORD || undefined
});

client.on('connect', () => {
	for (const id of MACS) {
		const topic = `home/OMG_ESP32_BLE/BTtoMQTT/${id.replaceAll(':', '')}`;
		const payload = JSON.stringify({
			id,
			name: 'Flower care',
			model: 'MiFlora',
			model_id: 'HHCCJCY01HHCC',
			tempc: Math.round((21 + Math.random() * 3) * 10) / 10,
			moi: moisture,
			lux: Math.round(500 + Math.random() * 2000),
			fer: 90
		});
		client.publish(topic, payload, () => console.log('published', topic, payload));
	}
	setTimeout(() => client.end(), 500);
});
