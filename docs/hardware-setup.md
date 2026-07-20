# Hardware bring-up

## 0. Accounts you need (one-off, both free)
- **HiveMQ Cloud** — https://console.hivemq.cloud → create a free Serverless cluster → Access Management → add a username+password. Note the cluster host (`<id>.s1.eu.hivemq.cloud`).
- **OpenPlantbook** — https://open.plantbook.io → sign up → API keys → generate. Goes in `OPENPLANTBOOK_API_KEY`.

## 1. Flash the ESP32 with OpenMQTTGateway
1. Connect the ESP32 to your Mac with a **data** micro-USB cable.
2. In Chrome, open https://docs.openmqttgateway.com/upload/web-install.html
3. Pick **esp32dev-ble** → Connect → select the serial port (install the CP210x driver if no port appears) → Install.
4. When it reboots, join the `OpenMQTTGateway` WiFi AP it broadcasts, open http://192.168.4.1, and enter:
   - your WiFi SSID + password
   - MQTT server: the HiveMQ host (no `mqtts://` prefix), port **8883**, TLS **enabled**
   - MQTT user/password: the HiveMQ credentials
   - Base topic: leave default (`home/`)
5. Verify: in the HiveMQ web client, subscribe to `#` — you should see `home/<gateway>/LWT` = `online`.

## 2. Sensors
1. Insert a CR2032 (flat side up — twist the sensor's top cap off).
2. Within ~1 minute the dashboard shows the sensor's MAC under **Unclaimed sensors**. No pairing needed — the hub passively hears BLE broadcasts.
3. Claim it, pick the species, stick the probe in the soil (light sensor window up, board top above the soil line).

## 3. Sanity checks
- Sensor in dry air → moisture ≤ ~5%; probe in a glass of water → 60%+.
- Unplug the hub for a moment and replug — readings resume within a few minutes (MQTT auto-reconnect).
- `sensor_silent` alert fires if a sensor or the hub is dead for >36h.

## 4. Battery notes
- The white HHCCJCY01 sensors don't broadcast battery level; the app shows 🔋 only when a sensor reports it (the pink HHCCJCY10 does). A dead battery surfaces as `sensor_silent`.
- Battery life ≈ 1 year per CR2032.
