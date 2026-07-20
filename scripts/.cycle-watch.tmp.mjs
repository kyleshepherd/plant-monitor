import mqtt from 'mqtt';
const c = mqtt.connect(process.env.MQTT_URL, { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD });
c.on('connect', () => c.subscribe('+/+/BTtoMQTT/#'));
let cycleSeen = false;
const newSensorData = [];
c.on('message', (t, p) => {
  try {
    const d = JSON.parse(p.toString());
    if (d.id === '5C:85:7E:13:6C:BA') {
      const keys = Object.keys(d).filter(k => !['id','rssi','name','mac','txpower','mac_type'].includes(k));
      if (keys.length) newSensorData.push(p.toString().slice(0, 200));
    }
    // battery packets from the known sensors mark the hourly connect cycle
    if (d.batt !== undefined && ['5C:85:7E:13:4D:23','5C:85:7E:13:50:8E'].includes(d.id) && !cycleSeen) {
      cycleSeen = true;
      console.log('hourly connect cycle detected (' + d.id + ' batt ' + d.batt + '%) — grace period 90s for the new sensor...');
      setTimeout(() => {
        if (newSensorData.length) newSensorData.forEach(l => console.log('NEW SENSOR DATA:', l));
        else console.log('CYCLE RAN BUT NOTHING FROM 6CBA');
        c.end(); process.exit(newSensorData.length ? 0 : 1);
      }, 90000);
    }
  } catch {}
});
setTimeout(() => {
  console.log(newSensorData.length ? 'data from 6CBA (no cycle marker seen):' : 'TIMEOUT: no connect cycle marker in 75min');
  newSensorData.forEach(l => console.log('NEW SENSOR DATA:', l));
  c.end(); process.exit(newSensorData.length ? 0 : 1);
}, 4500000);
