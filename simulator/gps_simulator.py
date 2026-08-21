"""
Multi-Equipment GPS Simulator
Simulates telemetry for all equipment in the fleet with varied behaviors,
device disconnection events, and realistic movement patterns.

Supports two modes:
  - HTTP mode (default): POST directly to FastAPI backend
  - MQTT mode: Publish to MQTT broker (bridge forwards to backend)

Usage:
    python gps_simulator.py              # HTTP mode
    python gps_simulator.py --mqtt       # MQTT mode
"""

import sys
import time
import math
import random
import json
import requests
from datetime import datetime

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────

API_URL = "http://127.0.0.1:8000/telemetry"
MQTT_HOST = "localhost"
MQTT_PORT = 1883
USE_MQTT = "--mqtt" in sys.argv

# ─────────────────────────────────────────────
# MQTT setup (optional)
# ─────────────────────────────────────────────

mqtt_client = None

if USE_MQTT:
    try:
        import paho.mqtt.client as mqtt
        mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
        mqtt_client.loop_start()
    except ImportError:
        print("  ✗ paho-mqtt not installed. Run: pip install paho-mqtt")
        sys.exit(1)
    except Exception as e:
        print(f"  ✗ Cannot connect to MQTT broker: {e}")
        sys.exit(1)

# ─────────────────────────────────────────────
# Equipment fleet configuration
# ─────────────────────────────────────────────

FLEET = [
    {
        "equipment_id": "TR-001",
        "device_id": "GPS-TR-001",
        "equipment_type": "tractor",
        "base_lat": 18.5204,
        "base_lng": 73.8567,
        "work_probability": 0.70,
        "idle_probability": 0.20,
        "max_speed": 12,
        "drift_factor": 0.0001,
    },
    {
        "equipment_id": "CR-001",
        "device_id": "GPS-CR-001",
        "equipment_type": "crane",
        "base_lat": 18.5212,
        "base_lng": 73.8581,
        "work_probability": 0.40,
        "idle_probability": 0.45,
        "max_speed": 3,
        "drift_factor": 0.00002,
    },
]

# ─────────────────────────────────────────────
# State tracking for each piece of equipment
# ─────────────────────────────────────────────

equipment_state = {}

for eq in FLEET:
    equipment_state[eq["equipment_id"]] = {
        "latitude": eq["base_lat"],
        "longitude": eq["base_lng"],
        "disconnected_ticks": 0,
        "is_disconnected": False,
    }


# ─────────────────────────────────────────────
# Telemetry generation
# ─────────────────────────────────────────────

def generate_telemetry(config):
    """Generate a telemetry packet for a single equipment."""
    eq_id = config["equipment_id"]
    state = equipment_state[eq_id]

    # Simulate random device disconnection (5% chance, lasts 3-6 ticks)
    if state["is_disconnected"]:
        state["disconnected_ticks"] -= 1
        if state["disconnected_ticks"] <= 0:
            state["is_disconnected"] = False
        return None

    if random.random() < 0.05:
        state["is_disconnected"] = True
        state["disconnected_ticks"] = random.randint(3, 6)
        return None

    # Determine operational state
    roll = random.random()
    if roll < config["work_probability"]:
        operational_state = "working"
    elif roll < config["work_probability"] + config["idle_probability"]:
        operational_state = "idle"
    else:
        operational_state = "offline"

    # Generate values based on state
    if operational_state == "working":
        speed = random.uniform(config["max_speed"] * 0.4, config["max_speed"])
        engine_on = True
        direction = random.uniform(0, 6.28)
        state["latitude"] += math.cos(direction) * config["drift_factor"]
        state["longitude"] += math.sin(direction) * config["drift_factor"]

    elif operational_state == "idle":
        speed = 0
        engine_on = True
        state["latitude"] += random.uniform(-0.000005, 0.000005)
        state["longitude"] += random.uniform(-0.000005, 0.000005)

    else:
        speed = 0
        engine_on = False

    # Signal strength varies by state
    if operational_state == "working":
        signal = random.randint(70, 100)
    elif operational_state == "idle":
        signal = random.randint(60, 95)
    else:
        signal = random.randint(40, 80)

    return {
        "equipment_id": eq_id,
        "device_id": config["device_id"],
        "latitude": state["latitude"],
        "longitude": state["longitude"],
        "speed": round(speed, 2),
        "engine_on": engine_on,
        "timestamp": datetime.now().isoformat(),
        "signal_strength": signal,
    }


# ─────────────────────────────────────────────
# Send telemetry (HTTP or MQTT)
# ─────────────────────────────────────────────

def send_telemetry(telemetry):
    """Send telemetry via HTTP or MQTT depending on mode."""
    eq_id = telemetry["equipment_id"]

    if USE_MQTT and mqtt_client:
        topic = f"fleet/telemetry/{eq_id}"
        payload = json.dumps(telemetry)
        mqtt_client.publish(topic, payload, qos=1)
        return "MQTT"
    else:
        response = requests.post(API_URL, json=telemetry)
        return f"HTTP {response.status_code}"


# ─────────────────────────────────────────────
# Main loop
# ─────────────────────────────────────────────

mode_str = "MQTT" if USE_MQTT else "HTTP"
print(f"═══════════════════════════════════════════════")
print(f"  Fleet GPS Simulator ({mode_str} mode)")
print(f"  Tracking {len(FLEET)} equipment")
print(f"  Sending telemetry every 5 seconds")
if USE_MQTT:
    print(f"  Broker: {MQTT_HOST}:{MQTT_PORT}")
else:
    print(f"  API: {API_URL}")
print(f"═══════════════════════════════════════════════")
print()

while True:
    for config in FLEET:
        eq_id = config["equipment_id"]
        state = equipment_state[eq_id]

        telemetry = generate_telemetry(config)

        if telemetry is None:
            remaining = state["disconnected_ticks"]
            print(
                f"  [{eq_id}] ⚠ DISCONNECTED"
                f" ({remaining} ticks remaining)"
            )
            continue

        try:
            result = send_telemetry(telemetry)

            status_str = (
                "WORKING" if telemetry["engine_on"] and telemetry["speed"] > 0
                else "IDLE" if telemetry["engine_on"]
                else "STOPPED"
            )

            print(
                f"  [{eq_id}] {status_str:8s}"
                f" | Lat: {telemetry['latitude']:.6f}"
                f" | Lon: {telemetry['longitude']:.6f}"
                f" | Speed: {telemetry['speed']:5.1f}"
                f" | Signal: {telemetry['signal_strength']}%"
                f" | {result}"
            )

        except requests.exceptions.RequestException as e:
            print(f"  [{eq_id}] ✗ Connection error: {e}")
        except Exception as e:
            print(f"  [{eq_id}] ✗ Error: {e}")

    print(f"  {'─' * 60}")
    time.sleep(5)
