# Smart Farm Network - IoT Agriculture Dashboard

Real-time agricultural sensor monitoring dashboard with **secure WebSocket (wss://)** on Port 443 and historical data via **Supabase REST API**.

## Features

✓ **Real-Time WebSocket (wss://)** — Secure encrypted connection on Port 443  
✓ **Live Sensor Feeds** — Temperature & humidity from 4+ locations  
✓ **Historical Data** — Fetch past 100 readings via REST API  
✓ **KPI Cards** — Average temperature/humidity with trend indicators (↑↓→)  
✓ **Sensor Status** — Active/Silent status for each node  
✓ **System Stats** — Uptime, message rate, active feed count  
✓ **Dark/Light Theme** — Theme toggle with local storage  
✓ **Responsive UI** — Mobile-friendly dashboard  
✓ **Auto-Reconnect** — Handles disconnections gracefully  

## Quick Start

### 1. Create Supabase Project
- Go to [supabase.co](https://supabase.co)
- Create a free project
- Copy your Project URL and Anon Key

### 2. Update Configuration
Edit `config.js`:
```javascript
const config = {
    getSupabaseUrl() {
        return 'https://YOUR_PROJECT.supabase.co'; // ← Replace
    },
    getSupabaseAnonKey() {
        return 'eyJ...'; // ← Replace
    },
    // ... rest stays same
};
```

### 3. Create Database Schema
In Supabase SQL Editor, run [supabase_schema.sql](supabase_schema.sql)

### 4. Start Publisher (Mock Sensors)
```bash
pip install supabase
python publisher.py
```

### 5. Open Dashboard
```bash
# Option A: Python server
python -m http.server 8000

# Option B: VS Code Live Server
# Right-click index.html → "Open with Live Server"
```
Then visit `http://localhost:8000`

**For detailed setup**, see [SETUP.md](SETUP.md)

---

## Architecture

### Data Flow
```
Publisher (publisher.py)
    ↓ INSERT
Supabase sensor_logs Table
    ├→ WebSocket (wss://) Port 443 [Real-Time Subscription]
    └→ REST API [Historical Queries]
        ↓
    Frontend Dashboard (index.html + app.js)
```

### Database Schema
```sql
CREATE TABLE sensor_logs (
  id BIGINT PRIMARY KEY,           -- Auto-increment
  feed_name TEXT,                  -- e.g., "VLM-01-temperature"
  value FLOAT,                     -- e.g., 25.3
  created_at TIMESTAMPTZ           -- Auto-timestamp
);
```

### Feed Name Format
Format: `{NodeID}-{Type}`

Example feeds:
- `VLM-01-temperature` → Villamor node, temperature reading
- `VLM-01-humidity` → Villamor node, humidity reading
- `AFP-01-temperature` → AFPOVAI node, temperature
- etc.

---

## File Overview

| File | Purpose |
|------|---------|
| `index.html` | Dashboard UI (HTML structure) |
| `app.js` | Main dashboard logic + WebSocket subscription |
| `config.js` | Supabase credentials & sensor node definitions |
| `style.css` | Styling (dark/light theme) |
| `publisher.py` | Mock sensor data generator → Supabase |
| `supabase_schema.sql` | Database schema creation |
| `SETUP.md` | Complete setup guide |

---

## WebSocket Connection (Real-Time)

The dashboard uses **Supabase Real-Time** to subscribe to sensor data changes:

```javascript
// Listens for INSERT events on sensor_logs
supabase.channel('sensor_logs_changes')
    .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sensor_logs'
    }, (payload) => {
        // Handle new reading instantly
        handleSupabaseInsert(payload.new);
    })
    .subscribe();
```

**Benefits**:
- <100ms latency
- TLS/SSL encrypted (wss://)
- Port 443 (standard HTTPS)
- Automatic reconnection
- Handles network interruptions

---

## REST API for History

Fetch past sensor readings:

```javascript
const response = await fetch(
    `${SUPABASE_URL}/rest/v1/sensor_logs?order=created_at.desc&limit=100`,
    { headers: { 'apikey': SUPABASE_ANON_KEY } }
);
const data = await response.json();
```

---

## Sensor Nodes

Currently configured for 4 locations:

| Node ID | Location |
|---------|----------|
| VLM-01 | Villamor |
| AFP-01 | AFP OVai |
| SLZ-01 | San Lorenzo |
| BLV-01 | Better Living |

**To add more nodes:**
1. Edit `config.js` → `SENSOR_NODES` array
2. Update `publisher.py` → `SENSORS` array
3. Restart publisher

---

## Dashboard Features

### KPI Cards
- **Average Temperature**: Shows avg of all nodes + trend
- **Average Humidity**: Shows avg of all nodes + trend
- **Active Nodes**: Count and last update time

### Sensor Table
Displays real-time status:
- Sensor ID & Location
- Current Temp & Humidity
- Status badge (Transmitting/Silent)
- Last update timestamp

### Real-Time Log
Shows each reading as it arrives, with:
- Timestamp
- Feed name
- Value (°C or %)

### System Stats
- **Active Feeds**: Count of nodes currently transmitting
- **Msg/Hour**: Message throughput
- **Uptime**: Connection duration in HH:MM:SS

### History Panel
- Click "Load from Supabase" to fetch 100 past readings
- Shows feed name, value, and timestamp
- Point-in-time snapshot (not real-time)

---

## Troubleshooting

### WebSocket Not Connecting
- [ ] Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `config.js`
- [ ] Check Supabase **Replication** is enabled for `sensor_logs`
- [ ] Check browser console (F12) for errors
- [ ] Try **Reconnect** button

### No Data Arriving
- [ ] Ensure `publisher.py` is running
- [ ] Check Supabase Table Editor → `sensor_logs` has rows
- [ ] Verify network tab shows `wss://` connection

### History Empty
- [ ] Wait a few moments for publisher to write data
- [ ] Check Supabase Table Editor manually
- [ ] Verify REST API endpoint in Network tab

---

## Security Notes

⚠️ **Never commit credentials to git!**

For production:
1. Use environment variables
2. Add `.env` to `.gitignore`
3. Use GitHub Secrets for CI/CD
4. Enable Supabase Row Level Security (RLS)

See [SETUP.md](SETUP.md) for detailed security best practices.

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires WebSocket support (all modern browsers).

---

## Next Steps

1. [Set up Supabase project](SETUP.md#step-1-create-supabase-project)
2. [Configure application](SETUP.md#step-3-configure-application)
3. [Run publisher](SETUP.md#step-5-run-publisher-data-generator)
4. [Open dashboard](#quick-start)
5. [Connect real sensors](SETUP.md#advanced-connect-real-arduino-sensors)

---

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Real-Time Guide](https://supabase.com/docs/guides/realtime)
- [JavaScript Client API](https://supabase.com/docs/reference/javascript)

---

**Version**: 7.0 (Supabase wss:// + REST API)  
**Last Updated**: May 2026
```cpp
#include <WiFi.h>
#include <Adafruit_MQTT.h>
#include <Adafruit_MQTT_Client.h>

#define WIFI_SSID       "your_wifi"
#define WIFI_PASS       "your_password"
#define AIO_USERNAME    "your_username"
#define AIO_KEY         "your_aio_key"

WiFiClient client;
Adafruit_MQTT_Client mqtt(&client, "io.adafruit.com", 1883, AIO_USERNAME, AIO_KEY);
Adafruit_MQTT_Publish tempFeed = Adafruit_MQTT_Publish(&mqtt, AIO_USERNAME "/feeds/temperature");
Adafruit_MQTT_Publish humFeed = Adafruit_MQTT_Publish(&mqtt, AIO_USERNAME "/feeds/humidity");

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("WiFi connected");
  
  // Connect to Adafruit IO MQTT
  while (!mqtt.connect()) {
    Serial.println("MQTT reconnecting...");
    delay(5000);
  }
  Serial.println("Connected to Adafruit IO MQTT!");
  
  // Publish test values
  tempFeed.publish(25.5);
  humFeed.publish(60.0);
}

void loop() {
  mqtt.parsePackets(1000);
  // Publish sensor readings periodically...
}
```

### 2. Open the Web App

For local testing, use a local server (not `file://`):
```bash
# Python 3
python -m http.server 8000

# Or Node.js
npx serve
```
Then open `http://localhost:8000`

For production, deploy to GitHub Pages (see below).

### 3. Enter Your Credentials

- **Adafruit IO Username**: Exact username (case-sensitive)
- **Adafruit IO Key**: Full key starting with `aio_` (from Adafruit IO → My Apps → View AIO Key)
- **Temperature Feed Key**: Usually `temperature` (change if your Arduino uses different name)
- **Humidity Feed Key**: Usually `humidity`

**Important:** Feed keys must exactly match what your Arduino uses. If Arduino publishes to `"temp"` instead of `"temperature"`, enter `temp` in the form.

### 4. Click Connect

Watch the **Debug Log** panel:
- ✅ Green checkmarks mean success
- ❌ Red errors show what failed
- The **Subscription Info** box shows the exact MQTT topics you're listening to

When data arrives:
- Temperature and humidity values update live
- History table fills with recent readings
- "Last update" timestamp refreshes

## Deploy to GitHub Pages

1. Create a GitHub repository
2. Add all files: `index.html`, `style.css`, `app.js`, `README.md`
3. Settings → Pages → Source: `main` branch, `/root` folder
4. Save → site publishes at `https://<username>.github.io/<repo>/`

## Understanding the Debug Log

The debug console tells you exactly what's happening:

```
🔗 Attempt 1/4: wss://io.adafruit.com:8080/mqtt  ← Trying broker
✅ Connected via: wss://io.adafruit.com:8080/mqtt  ← Success!
📡 Topics: username/feeds/temperature, username/feeds/humidity
✅ Subscribed to temperature
✅ Subscribed to humidity
📨 [username/feeds/temperature] = 25.5           ← Data arrived!
✅ First data packet received!
```

If connection fails:
```
❌ All broker URLs failed
❌ Connection failed: Connection timeout
🔧 TROUBLESHOOTING:
1. Check network - is port 8080 blocked?
2. Try a different network (mobile hotspot)
3. Disable VPN/Firewall temporarily
📋 Expected MQTT Topics:
   Temperature: username/feeds/temperature
   Humidity: username/feeds/humidity
```

**Copy the log** with the **📋 Copy** button and share it when asking for help (redact your AIO key!).

## Common Issues & Fixes

### 🔴 "Connection failed: timeout"
**Cause:** Network blocks WebSocket port 8080 or credentials wrong  
**Fix:**
- Try mobile hotspot (bypasses corporate firewall)
- Double-check username/AIO key
- Verify Adafruit IO is up: https://io.adafruit.com/status

### 🔴 "Not authorized" error
**Cause:** Wrong credentials or feed doesn't exist  
**Fix:**
1. Log into Adafruit IO → My Apps → copy fresh AIO key
2. Go to Feeds → verify feed names exist exactly
3. If feeds missing, create them or adjust web form feed keys

### 🔴 Connected but no data ever arrives
**Cause:** Feed name mismatch OR Arduino not actually publishing  
**Fix:**
1. Check the **Subscription Info** box on dashboard - note the exact topics
2. Compare with your Arduino code's `AIO_USERNAME "/feeds/..."` strings
3. They must match **exactly** (including case)
4. Verify Arduino Serial Monitor shows "sent" messages
5. Check Adafruit IO website - do you see data there?
   - If yes → wrong feed keys in web app
   - If no → Arduino publishing issue

### 🔴 Page refreshes when clicking Connect
**Fixed in v2.0** - if still happening, JavaScript may be blocked. Ensure:
- Browser allows JavaScript
- No extensions blocking scripts
- MQTT.js CDN loaded (check Network tab in DevTools)

### 🔴 Debug console is empty
- Check browser console (F12) for JavaScript errors
- Ensure MQTT.js CDN is accessible
- Try hard refresh (Ctrl+F5)

## Architecture

```
┌─────────────┐     WebSocket (WSS)     ┌──────────────────┐
│   Browser   │ ───────────────────────▶ │ Adafruit IO      │
│   (app.js)  │   wss://io.adafruit.com │ MQTT Broker      │
│             │ ◀─────────────────────── │                  │
│  MQTT.js    │      MQTT Messages      │   Feeds:         │
│  Client     │                          │   temperature    │
│             │                          │   humidity       │
└─────────────┘                          └──────────────────┘
       │
       ▼
┌─────────────────────┐
│   Arduino/ESP32     │
│   (publishes to     │
│    same topics)     │
└─────────────────────┘
```

## File Structure

```
.
├── index.html      # UI: login + dashboard
├── style.css       # Green theme, animations, responsive
├── app.js          # MQTT logic, debug console, data handling
└── README.md       # This file
```

## Security Notes

- AIO key stored in `localStorage` (browser only, not sent anywhere else)
- Connection is direct to Adafruit IO (no intermediate server)
- For production, consider rotating keys regularly
- Use read-only keys if you only need to subscribe (not publish)

## Need Help?

1. Check the **Debug Log** in the app - it's very detailed
2. Copy the log (📋 Copy button) and remove your AIO key
3. Create a GitHub issue with:
   - Debug log
   - Arduino publishing code snippet
   - Screenshot of your Adafruit IO feed names

---

**Note:** This subscriber connects directly to Adafruit IO via WebSockets. No backend server required. Works on GitHub Pages.
