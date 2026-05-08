import sqlite3
from datetime import datetime
from supabase import create_client, Client
import random

SUPABASE_URL = "https://mheccuaathqhcfodbkif.supabase.co"  # ← replace with your Supabase project URL
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZWNjdWFhdGhxaGNmb2Ria2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NjM3NzAsImV4cCI6MjA5MzQzOTc3MH0.wr7oyYT-7QIey23AzWnfgL_cypQQVEtj2SCkSQQHIOw"  # ← replace with your Supabase anon key

# Initialize Supabase client with secure WebSocket configuration (wss:// on Port 443)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

SENSORS = [
    ("Villamor", "temp"),
    ("Villamor", "hum"),
    ("AFPOVAI", "temp"),
    ("AFPOVAI", "hum"),
    ("San Lorenzo", "temp"),
    ("San Lorenzo", "hum"),
    ("Better Living", "temp"),
    ("Better Living", "hum"),
]

def init_db():
    """Initialize local SQLite database for sensor readings"""
    conn = sqlite3.connect("sensor_data.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS readings (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT    NOT NULL,
            location  TEXT    NOT NULL,
            sensor_type TEXT  NOT NULL,
            value     REAL    NOT NULL
        )
    """)
    conn.commit()
    conn.close()
    print("[DB] Database ready.")

def save_reading(location, sensor_type, value):
    """Save reading to both local SQLite and Supabase"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Save to local SQLite
    try:
        conn = sqlite3.connect("sensor_data.db")
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO readings (timestamp, location, sensor_type, value) VALUES (?, ?, ?, ?)",
            (timestamp, location, sensor_type, value)
        )
        conn.commit()
        conn.close()
        print(f"[DB] Saved → {location} {sensor_type}: {value}")
    except Exception as e:
        print(f"[DB] Error saving: {e}")

    # Save to Supabase via secure WebSocket (wss:// on Port 443)
    try:
        data = {
            "location": location,
            "sensor_type": sensor_type,
            "value": value,
            "timestamp": datetime.now().isoformat()
        }
        supabase.table("sensor_readings").insert(data).execute()
        print(f"[Supabase] Saved → {location} {sensor_type}: {value}")
    except Exception as e:
        print(f"[Supabase] Error saving: {e}")

def main():
    print("[Supabase Subscriber] Starting secure WebSocket connection (wss:// on Port 443)...")
    print(f"[Supabase] URL: {SUPABASE_URL}")
    
    init_db()
    
    # Subscribe to real-time changes from Supabase
    print("[Supabase] Setting up real-time subscription...")
    
    subscription = supabase.channel('sensor_changes').on(
        'postgres_changes',
        {
            'event': 'INSERT',
            'schema': 'public',
            'table': 'sensor_readings'
        },
        lambda payload: print(f"[Supabase] New reading: {payload}")
    ).subscribe()
    
    print("[Supabase] Listening for sensor data updates...")
    print("Press Ctrl+C to stop.\n")
    
    try:
        # Simulate receiving and saving sensor data
        import time
        while True:
            for location, sensor_type in SENSORS:
                if sensor_type == "temp":
                    value = round(random.uniform(20, 35), 1)
                else:
                    value = round(random.uniform(40, 80), 1)
                
                save_reading(location, sensor_type, value)
                time.sleep(0.5)
            
            time.sleep(10)
    
    except KeyboardInterrupt:
        print("\n[Supabase] Stopped.")
        supabase.remove_channel(subscription)

if __name__ == "__main__":
    main()