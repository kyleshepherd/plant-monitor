import mqtt from 'mqtt';
const c = mqtt.connect(process.env.MQTT_URL, { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD });
c.on('connect', () => c.subscribe('+/+/BTtoMQTT/#'));
c.on('message', (t, p) => {
  try {
    const d = JSON.parse(p.toString());
    if (d.id === '5C:85:7E:13:6C:BA' && /HHCC/.test(String(d.model_id ?? d.model ?? ''))) {
      console.log('SENSOR BROADCASTING:', p.toString().slice(0, 180));
      c.end(); process.exit(0);
    }
  } catch {}
});
setTimeout(() => { console.log('still nothing decoded from 6CBA after 5min'); c.end(); process.exit(1); }, 300000);
