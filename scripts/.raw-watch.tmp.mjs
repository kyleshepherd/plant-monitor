import mqtt from 'mqtt';
const c = mqtt.connect(process.env.MQTT_URL, { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD });
c.on('connect', () => {
  c.publish('home/OMG_ESP32_BLE/commands/MQTTtoBT/config', JSON.stringify({ pubadvdata: true }));
  c.subscribe('+/+/BTtoMQTT/#');
  console.log('raw advertisement publishing ON, listening 3min for 6C:BA...');
});
c.on('message', (t, p) => {
  if (t.includes('5C857E136CBA')) console.log(new Date().toISOString().slice(14,19), p.toString().slice(0, 300));
});
setTimeout(() => {
  c.publish('home/OMG_ESP32_BLE/commands/MQTTtoBT/config', JSON.stringify({ pubadvdata: false }), () => {
    console.log('raw publishing OFF');
    setTimeout(() => { c.end(); process.exit(0); }, 1000);
  });
}, 180000);
