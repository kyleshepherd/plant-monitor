import mqtt from 'mqtt';
const c = mqtt.connect(process.env.MQTT_URL, { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD });
c.on('connect', () => c.subscribe('+/+/BTtoMQTT/#'));
c.on('message', (t, p) => {
  try {
    const d = JSON.parse(p.toString());
    if (d.model_id?.startsWith('HHCCJCY') && d.lux !== undefined) {
      console.log(new Date().toISOString().slice(11, 19), d.id, 'lux =', d.lux);
    }
  } catch {}
});
setTimeout(() => { c.end(); process.exit(0); }, 180000);
