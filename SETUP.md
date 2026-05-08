# Smart Farm Network - Setup Guide

Complete guide to set up your Supabase-powered IoT agricultural monitoring dashboard with secure WebSocket real-time updates.

---

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────────┐
│  Arduino Nodes  │         │   Publisher.py       │
│  (Sensors)      │────────→│   (Data Generator)   │
└─────────────────┘         └──────────────────────┘
                                     │
                                     │ Insert
                                     ▼
                    ┌────────────────────────────────┐
                    │  Supabase sensor_logs Table    │
                    │  ┌────────────────────────────┐│
                    │  │ id (auto)                  ││
                    │  │ feed_name (VLM-01-temp)    ││
                    │  │ value (25.5)               ││
                    │  │ created_at (auto)          ││
                    │  └────────────────────────────┘│
                    └────────────────────────────────┘
                                     │
                    ┌────────────────┴──────────────────┐
                    │                                   │
                    ▼ (WebSocket wss:// Port 443)     ▼ (REST API)
           ┌──────────────────┐            ┌────────────────────┐
           │  Frontend App    │            │  History Viewer    │
           │  Real-Time View  │            │  (Fetch Past 100)  │
           │  (app.js)        │            │  (REST Endpoint)   │
           └──────────────────┘            └────────────────────┘
```

---

## Prerequisites

1. **Supabase Account**: Create free account at https://supabase.co
2. **Node environment** (for running publisher.py)
3. **Python 3.8+** with `supabase-py` library
4. **Modern web browser** (Chrome, Firefox, Safari, Edge)

---

## Step 1: Create Supabase Project

### 1.1 Create Project
1. Go to [supabase.co](https://supabase.co) and sign up
2. Click **"New Project"**
3. Fill in:
   - **Project Name**: `SmartFarmNetwork` (or your choice)
   - **Database Password**: Use strong password (save it!)
   - **Region**: Pick closest to your location
4. Click **"Create new project"** (wait 1-2 minutes)

### 1.2 Get Your Credentials
After project is created:
1. Go to **Settings** → **API**
2. Copy these values (keep safe!):
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Anon Public Key** (starts with `eyJ...`)
3. Paste them into [config.js](#step-2-configure-application)

---

## Step 2: Create Database Schema

### 2.1 Execute SQL in Supabase
1. In Supabase dashboard, click **"SQL Editor"** (left menu)
2. Click **"New Query"**
3. Copy and paste this SQL:

```sql
DROP TABLE IF EXISTS sensor_logs;

CREATE TABLE sensor_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feed_name TEXT NOT NULL,
  value FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sensor_logs_feed_name ON sensor_logs (feed_name);
CREATE INDEX idx_sensor_logs_created_at ON sensor_logs (created_at DESC);

-- Enable real-time subscriptions
ALTER TABLE sensor_logs REPLICA IDENTITY FULL;
```

4. Click **"Run"** (green button)
5. You should see: `CREATE TABLE`, `CREATE INDEX` ✓

---

## Step 3: Configure Application

### 3.1 Update config.js
Open [config.js](config.js) and replace:

```javascript
const config = {
    getSupabaseUrl() {
        return 'https://YOUR_PROJECT_ID.supabase.co';  // ← Replace
    },

    getSupabaseAnonKey() {
        return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';  // ← Replace
    },
    
    // ... rest stays the same
};
```

**Where to find these values:**
- Go to Supabase Dashboard → **Settings** → **API**
- Copy **Project URL** and **Anon Public Key**

### 3.2 Update publisher.py
Open [publisher.py](publisher.py) and replace at top:

```python
SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Use the **same values** from Step 3.1.

---

## Step 4: Enable Real-Time on Supabase

### 4.1 Enable Real-Time Subscriptions
1. Go to **Supabase Dashboard** → **Replication** (left menu)
2. Under **Replication** section, find `sensor_logs` table
3. Toggle **ON** (if it's OFF)
4. Check the box next to `sensor_logs`
5. Click **Save**

This enables WebSocket subscriptions for real-time updates.

---

## Step 5: Run Publisher (Data Generator)

### 5.1 Install Dependencies
```bash
pip install supabase
```

### 5.2 Start Publisher
```bash
python publisher.py
```

You should see:
```
[Supabase Publisher] Starting secure WebSocket connection (wss:// on Port 443)...
[Supabase] URL: https://xxxxx.supabase.co
[Supabase] Table: sensor_logs
[Supabase] Schema: feed_name, value, created_at

[HH:MM:SS] Publishing sensor data...
[Supabase] Published → VLM-01-temperature: 25.3
[Supabase] Published → VLM-01-humidity: 62.4
[Supabase] Published → AFP-01-temperature: 28.1
...
```

**Keep this running in background** (opens every 10 seconds).

---

## Step 6: Open Dashboard

### 6.1 Serve the Frontend
If running locally, you can:

**Option A: Simple HTTP Server (Python 3)**
```bash
python -m http.server 8000
```

**Option B: VS Code Live Server**
- Install "Live Server" extension
- Right-click `index.html` → **"Open with Live Server"**

**Option C: Use GitHub Pages**
- Push files to GitHub repo
- Enable GitHub Pages from `main` branch
- Access at `https://YOUR_USERNAME.github.io/IOTSYSM_MRT-Z/`

### 6.2 View Dashboard
Open browser to:
- Local: `http://localhost:8000`
- Or your deployed URL

You should see:
- ✓ Real-time temperature & humidity readings
- ✓ Sensor node status (Transmitting/Silent)
- ✓ Active feed count updating
- ✓ Messages per hour
- ✓ Uptime clock

---

## Feed Name Format

Feeds are named: `{NodeID}-{Type}`

| Node | Location | Feed Names |
|------|----------|-----------|
| VLM-01 | Villamor | `VLM-01-temperature`, `VLM-01-humidity` |
| AFP-01 | AFPOVAI | `AFP-01-temperature`, `AFP-01-humidity` |
| SLZ-01 | San Lorenzo | `SLZ-01-temperature`, `SLZ-01-humidity` |
| BLV-01 | Better Living | `BLV-01-temperature`, `BLV-01-humidity` |

To add more nodes, edit `config.js`:

```javascript
SENSOR_NODES: [
    { id: 'VLM-01', location: 'Villamor' },
    { id: 'AFP-01', location: 'AFPOVAI' },
    { id: 'SLZ-01', location: 'San Lorenzo' },
    { id: 'BLV-01', location: 'Better Living' },
    { id: 'YOB-01', location: 'New Location' }  // ← Add here
]
```

And update `publisher.py` SENSORS array with matching feeds.

---

## Features

### Real-Time Monitoring (WebSocket wss://)
- **Port**: 443 (Secure WebSocket)
- **Protocol**: TLS/SSL encrypted
- **Latency**: <100ms typically
- **Subscribed to**: `sensor_logs` INSERT events

### Historical Data (REST API)
- Click **"Load from Supabase"** button
- Fetches last 100 entries
- Uses standard REST pagination
- No real-time updates (point-in-time query)

### Dashboard Features
- **KPI Cards**: Average temperature, humidity with trends (↑↓→)
- **Sensor Table**: Live status of all nodes
- **Real-Time Log**: Feed events as they arrive
- **System Stats**: Active feeds, msg/hour, uptime
- **Theme Toggle**: Dark/Light mode
- **Reconnect Button**: Manually reconnect WebSocket
- **Clear Log**: Reset message log

---

## Troubleshooting

### WebSocket Not Connecting
**Problem**: "Disconnected" status, no data arriving

**Solution**:
1. Check **Replication** is enabled for `sensor_logs` table
2. Verify Supabase credentials in `config.js`
3. Check browser console for errors (F12 → Console)
4. Try **Reconnect** button
5. Check network tab to see `wss://` handshake

### No Historical Data
**Problem**: "Load from Supabase" returns empty

**Solution**:
1. Ensure `publisher.py` is running and inserting data
2. Check Supabase dashboard → **Table Editor** → `sensor_logs`
3. Verify REST API endpoint in browser DevTools Network tab

### Data Not Publishing
**Problem**: Publisher runs but Supabase shows no data

**Solution**:
1. Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `publisher.py`
2. Test Supabase connection:
   ```bash
   python -c "from supabase import create_client; print('OK')"
   ```
3. Check Supabase Dashboard → **Logs** → **Error** tab
4. Try manual insert in SQL Editor to test table permissions

---

## Security Best Practices

### ⚠️ Credentials Management

**Never commit credentials** to git:

1. **Local Development**: Use environment variables
   ```bash
   export SUPABASE_URL="https://xxxxx.supabase.co"
   export SUPABASE_ANON_KEY="eyJ..."
   ```

2. **Production**: Use `.env` file (add to `.gitignore`)
   ```
   .env
   ```

3. **GitHub Pages**: Use GitHub Secrets + build script
   - Store credentials as repository secrets
   - Build script injects them at deploy time

### Row Level Security (RLS)

Enable RLS on `sensor_logs` table:

```sql
ALTER TABLE sensor_logs ENABLE ROW LEVEL SECURITY;

-- Allow public read (real-time subscribe)
CREATE POLICY "Allow public read" ON sensor_logs
  FOR SELECT USING (true);

-- Allow public insert (publisher writes)
CREATE POLICY "Allow public insert" ON sensor_logs
  FOR INSERT WITH CHECK (true);
```

---

## Advanced: Connect Real Arduino Sensors

Replace the mock `publisher.py` with actual Arduino code:

**Arduino Sketch (pseudo-code)**:
```cpp
#include <WiFi.h>
#include <HTTPClient.h>

void publishSensor(String feed, float value) {
  String url = "https://YOUR_SUPABASE.supabase.co/rest/v1/sensor_logs";
  
  String payload = "{\"feed_name\":\"" + feed + "\",\"value\":" + value + "}";
  
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  
  int code = http.POST(payload);
  // Handle response...
}

void loop() {
  float temp = readTemperature();
  float hum = readHumidity();
  
  publishSensor("VLM-01-temperature", temp);
  publishSensor("VLM-01-humidity", hum);
  
  delay(10000); // Every 10 seconds
}
```

---

## File Structure

```
IOTSYSM_MRT-Z/
├── index.html          # Frontend UI
├── app.js              # Dashboard logic + WebSocket
├── config.js           # Supabase credentials
├── style.css           # Styling (dark/light theme)
├── publisher.py        # Data publisher (mock sensors)
├── supabase_schema.sql # Database schema
├── SETUP.md            # This file
└── README.md           # Project overview
```

---

## Support

### Useful Links
- [Supabase Docs](https://supabase.com/docs)
- [Supabase Real-Time Guide](https://supabase.com/docs/guides/realtime)
- [JavaScript Client Library](https://supabase.com/docs/reference/javascript)

### Common Issues
- **Port 443 blocked**: Try with VPN or check firewall
- **CORS errors**: Use Supabase's built-in CORS handling
- **Memory leaks**: WebSocket is cleaned up on disconnect

---

**Last Updated**: May 2026  
**Version**: 7.0 (Supabase wss:// + REST API)
