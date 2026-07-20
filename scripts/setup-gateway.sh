#!/bin/bash
# Configures the OpenMQTTGateway ESP32 via its captive portal — run while your
# Mac is connected to the OMG_ESP32_BLE WiFi hotspot. Works fully offline.
# Everything is logged to scripts/gateway-setup.log for debugging.
set -u
cd "$(dirname "$0")/.."
LOG=scripts/gateway-setup.log
: > "$LOG"
PORTAL=http://192.168.4.1

MQTT_HOST="13141a03abb44b9ba56f3d3e41b2c50a.s1.eu.hivemq.cloud"
MQTT_PORT="8883"
MQTT_USER="plant-hub"
MQTT_PASS="CT4WK4puoOa1"
GW_PASS="a8e3961bbdc71e1f"

echo "== OpenMQTTGateway setup =="
read -r -p "Your home WiFi name (SSID): " SSID
read -r -s -p "Your home WiFi password (typed locally, only sent to the board): " WPASS
echo; echo

echo "Checking the portal is reachable..."
if ! curl -s -m 5 -o /tmp/omg-root.html "$PORTAL/"; then
	echo "❌ Can't reach 192.168.4.1 — is this Mac connected to the OMG_ESP32_BLE WiFi?"
	exit 1
fi

echo "Fetching the config form..."
curl -s -m 10 "$PORTAL/wifi" -o /tmp/omg-form.html 2>>"$LOG" || curl -s -m 10 "$PORTAL/0wifi" -o /tmp/omg-form.html 2>>"$LOG"
cp /tmp/omg-form.html scripts/gateway-form-snapshot.html 2>/dev/null

python3 - "$SSID" "$WPASS" "$MQTT_HOST" "$MQTT_PORT" "$MQTT_USER" "$MQTT_PASS" "$GW_PASS" <<'PY'
import html.parser, re, sys, urllib.parse, urllib.request

ssid, wpass, host, port, user, mpass, gwpass = sys.argv[1:8]

class Forms(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = []  # (name, type, value, checked)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'input' and a.get('name'):
            self.fields.append((a['name'], a.get('type', 'text'), a.get('value', ''), 'checked' in a))

p = Forms()
p.feed(open('/tmp/omg-form.html', encoding='utf-8', errors='replace').read())

if not p.fields:
    print('❌ No form fields found — saved page to scripts/gateway-form-snapshot.html; show Claude.')
    sys.exit(1)

data = {}
log = []
for name, typ, value, checked in p.fields:
    n = name.lower()
    if name == 's' or 'ssid' in n:
        data[name] = ssid
    elif name == 'p' or n in ('wpass', 'wifipass', 'wifi_pass'):
        data[name] = wpass
    elif 'server' in n or 'host' in n or n == 'mh':
        data[name] = host
    elif 'port' in n:
        data[name] = port
    elif 'user' in n:
        data[name] = user
    elif 'ota' in n or 'gw' in n or 'gateway' in n and 'pass' in n:
        data[name] = gwpass
    elif 'pass' in n or n == 'mp':
        data[name] = mpass
    elif 'secure' in n or 'tls' in n or n == 'ms':
        data[name] = 'on' if typ == 'checkbox' else value or 'true'
    elif typ == 'checkbox':
        if checked:
            data[name] = value or 'on'
    else:
        data[name] = value  # keep the board's default (topic, name, etc.)
    log.append(f'  {name} ({typ}) -> {"***" if "pass" in n or name == "p" else data.get(name, "<skipped>")}')

print('Form fields mapped:')
print('\n'.join(log))
open('scripts/gateway-setup.log', 'a').write('\n'.join(log) + '\n')

body = urllib.parse.urlencode(data).encode()
req = urllib.request.Request('http://192.168.4.1/wifisave', data=body,
                             headers={'Content-Type': 'application/x-www-form-urlencoded'})
try:
    resp = urllib.request.urlopen(req, timeout=15)
    out = resp.read().decode(errors='replace')
    open('scripts/gateway-setup.log', 'a').write(out + '\n')
    print('\n✅ Submitted. The board is rebooting and joining your WiFi.')
    print('   The OMG_ESP32_BLE hotspot should disappear in ~30s.')
    print('   Reconnect this Mac to your normal WiFi, then tell Claude "script done".')
except Exception as e:
    print(f'\n⚠️  Submit result: {e}')
    print('   (A dropped connection right after submit is NORMAL — the board reboots')
    print('   immediately. If the hotspot disappears in ~30s, it worked.)')
PY
