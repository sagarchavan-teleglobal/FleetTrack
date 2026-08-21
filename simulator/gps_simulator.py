"""
Multi-Equipment GPS Simulator
Simulates telemetry for all equipment in the fleet with varied behaviors,
device disconnection events, and realistic movement patterns.
"""

import time
import random
import requests
from datetime import datetime

API_URL = "http://127.0.0.1:8000/telemetry"

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

    # Simulate random device disconnection (5% chance to disconnect, lasts 3-6 ticks)
    if state["is_disconnected"]:
        state["disconnected_ticks"] -= 1
        if state["disconnected_ticks"] <= 0:
            state["is_disconnected"] = False
        return None  # No telemetry when disconnected

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
        # Move in a somewhat realistic pattern
        direction = random.uniform(0, 6.28)  # radians
        import math
        state["latitude"] += math.cos(direction) * config["drift_factor"]
        state["longitude"] += math.sin(direction) * config["drift_factor"]

    elif operational_state == "idle":
        speed = 0
        engine_on = True
        # Tiny GPS drift when stationary
        state["latitude"] += random.uniform(-0.000005, 0.000005)
        state["longitude"] += random.uniform(-0.000005, 0.000005)

    else:  # offline/stopped
        speed = 0
        engine_on = False

    # Signal strength varies
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
# Main loop
# ─────────────────────────────────────────────

print(f"═══════════════════════════════════════════════")
print(f"  Fleet GPS Simulator")
print(f"  Tracking {len(FLEET)} equipment")
print(f"  Sending telemetry every 5 seconds")
print(f"═══════════════════════════════════════════════")
print()

while True:
    for config in FLEET:
        eq_id = config["equipment_id"]
        state = equipment_state[eq_id]

        telemetry = generate_telemetry(config)

        if telemetry is None:
            # Device is disconnected
            remaining = state["disconnected_ticks"]
            print(
                f"  [{eq_id}] ⚠ DISCONNECTED"
                f" ({remaining} ticks remaining)"
            )
            continue

        try:
            response = requests.post(API_URL, json=telemetry)

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
                f" | HTTP {response.status_code}"
            )

        except requests.exceptions.RequestException as e:
            print(f"  [{eq_id}] ✗ Connection error: {e}")

    print(f"  {'─' * 60}")
    time.sleep(5)
