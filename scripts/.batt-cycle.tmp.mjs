import mqtt from 'mqtt';
const c = mqtt.connect(process.env.MQTT_URL, { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD });
c.on('connect', () => c.subscribe('+/+/BTtoMQTT/#'));
let seen = 0;
c.on('message', (t, p) => {
  try { const d = JSON.parse(p.toString());
    if (d.batt !== undefined && /HHCC/.test(String(d.model_id ?? d.model ?? ''))) {
      console.log(new Date().toISOString().slice(11,19), 'UTC batt on broker:', d.id, d.batt + '%');
      if (++seen >= 2) setTimeout(() => { c.end(); process.exit(0); }, 8000);
    }
  } catch {}
});
setTimeout(() => { console.log('no batt cycle within 75min'); c.end(); process.exit(1); }, 4500000);
