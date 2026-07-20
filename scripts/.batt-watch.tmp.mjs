import mqtt from 'mqtt';
const c = mqtt.connect(process.env.MQTT_URL, { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD });
c.on('connect', () => c.subscribe('+/+/BTtoMQTT/#'));
c.on('message', (t, p) => {
  try {
    const d = JSON.parse(p.toString());
    if (d.model_id?.startsWith('HHCCJCY') && d.batt !== undefined) {
      console.log('BATTERY:', d.id, d.batt + '%');
      process.exit(0);
    }
  } catch {}
});
setTimeout(() => { console.log('NO_BATTERY_AFTER_15MIN'); c.end(); process.exit(1); }, 900000);
