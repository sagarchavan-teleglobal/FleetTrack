"""
GPS Telemetry Simulator
========================
Simulates GPS devices sending telemetry data for all registered equipment.
Each device moves around Pune with realistic speed, heading changes, and
engine on/off cycles.

Usage:
    python gps_simulator.py [--interval 3] [--api-url http://localhost:8000]

Press Ctrl+C to stop.
"""

import argparse
import math
import random
import time
from datetime import datetime, timezone

import requests

# --------------------------------------------------
# Configuration
# --------------------------------------------------

DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_INTERVAL = 3  # seconds between updates

# Pune center coordinates
PUNE_CENTER = (18.5204, 73.8567)
PUNE_RADIUS_KM = 5  # max distance from center

# Equipment simulation profiles
PROFILES = {
    "tractor": {
        "max_speed": 25,       # km/h
        "acceleration": 3,     # km/h per tick
        "turn_rate": 30,       # degrees per tick
        "idle_chance": 0.15,
        "stop_chance": 0.05,
    },
    "crane": {
        "max_speed": 8,        # cranes move slowly when relocating
        "acceleration": 1,
        "turn_rate": 15,
        "idle_chance": 0.3,    # often stationary
        "stop_chance": 0.1,
    },
    "excavator": {
        "max_speed": 12,
        "acceleration": 2,
        "turn_rate": 20,
        "idle_chance": 0.2,
        "stop_chance": 0.08,
    },
    "dumper": {
        "max_speed": 40,
        "acceleration": 5,
        "turn_rate": 25,
        "idle_chance": 0.1,
        "stop_chance": 0.05,
    },
}


# --------------------------------------------------
# Simulator State
# --------------------------------------------------

class DeviceState:
    """Tracks simulated state for one GPS device."""

    def __init__(self, device_id: str, equipment_id: str, equipment_type: str,
                 lat: float, lng: float):
        self.device_id = device_id
        self.equipment_id = equipment_id
        self.equipment_type = equipment_type
        self.lat = lat
        self.lng = lng
        self.speed = 0.0  # km/h
        self.heading = random.uniform(0, 360)  # degrees
        self.engine_on = True
        self.signal_strength = random.randint(70, 100)
        self.profile = PROFILES.get(equipment_type, PROFILES["crane"])

        # State machine: "moving", "idle", "stopped"
        self.mode = random.choice(["moving", "idle"])
        self.mode_ticks = 0  # how long in current mode
        self.mode_duration = random.randint(5, 20)  # ticks before mode change

    def tick(self, interval_seconds: float):
        """Advance simulation by one tick."""

        self.mode_ticks += 1

        # Mode transitions
        if self.mode_ticks >= self.mode_duration:
            self._transition_mode()

        # Update based on mode
        if self.mode == "moving":
            self._move(interval_seconds)
        elif self.mode == "idle":
            self.speed = 0.0
            self.engine_on = True
        else:  # stopped
            self.speed = 0.0
            self.engine_on = False

        # Signal strength fluctuation
        self.signal_strength = max(30, min(100,
            self.signal_strength + random.randint(-3, 3)
        ))

        # Keep within Pune bounds
        self._clamp_position()

    def _transition_mode(self):
        """Switch between moving/idle/stopped."""
        roll = random.random()
        profile = self.profile

        if self.mode == "moving":
            if roll < profile["stop_chance"]:
                self.mode = "stopped"
                self.mode_duration = random.randint(10, 30)
            elif roll < profile["stop_chance"] + profile["idle_chance"]:
                self.mode = "idle"
                self.mode_duration = random.randint(5, 15)
            else:
                # Keep moving, change direction
                self.heading += random.uniform(-60, 60)
                self.mode_duration = random.randint(8, 25)
        elif self.mode == "idle":
            if roll < 0.6:
                self.mode = "moving"
                self.mode_duration = random.randint(10, 30)
            else:
                self.mode = "stopped"
                self.mode_duration = random.randint(5, 20)
        else:  # stopped
            if roll < 0.7:
                self.mode = "moving"
                self.mode_duration = random.randint(10, 30)
            else:
                self.mode = "idle"
                self.mode_duration = random.randint(5, 10)

        self.mode_ticks = 0

    def _move(self, interval_seconds: float):
        """Update position based on speed and heading."""
        self.engine_on = True
        profile = self.profile

        # Accelerate/decelerate
        target_speed = random.uniform(
            profile["max_speed"] * 0.3,
            profile["max_speed"]
        )
        diff = target_speed - self.speed
        self.speed += min(abs(diff), profile["acceleration"]) * (1 if diff > 0 else -1)
        self.speed = max(0.5, min(self.speed, profile["max_speed"]))

        # Slight heading changes
        self.heading += random.uniform(
            -profile["turn_rate"] * 0.3,
            profile["turn_rate"] * 0.3
        )
        self.heading %= 360

        # Convert speed to lat/lng delta
        # 1 degree lat ≈ 111km, 1 degree lng ≈ 111km * cos(lat)
        distance_km = (self.speed * interval_seconds) / 3600
        heading_rad = math.radians(self.heading)

        delta_lat = (distance_km / 111.0) * math.cos(heading_rad)
        delta_lng = (distance_km / (111.0 * math.cos(math.radians(self.lat)))) * math.sin(heading_rad)

        self.lat += delta_lat
        self.lng += delta_lng

    def _clamp_position(self):
        """Keep device within PUNE_RADIUS_KM of center."""
        dlat = self.lat - PUNE_CENTER[0]
        dlng = self.lng - PUNE_CENTER[1]
        dist_km = math.sqrt((dlat * 111) ** 2 + (dlng * 111 * math.cos(math.radians(self.lat))) ** 2)

        if dist_km > PUNE_RADIUS_KM:
            # Point back toward center
            self.heading = math.degrees(math.atan2(
                PUNE_CENTER[1] - self.lng,
                PUNE_CENTER[0] - self.lat
            ))
            # Nudge back
            self.lat += (PUNE_CENTER[0] - self.lat) * 0.1
            self.lng += (PUNE_CENTER[1] - self.lng) * 0.1

    def to_telemetry(self) -> dict:
        """Generate telemetry payload for the API."""
        return {
            "equipment_id": self.equipment_id,
            "device_id": self.device_id,
            "latitude": round(self.lat, 6),
            "longitude": round(self.lng, 6),
            "speed": round(self.speed, 2),
            "engine_on": self.engine_on,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "signal_strength": self.signal_strength,
        }


# --------------------------------------------------
# Main Loop
# --------------------------------------------------

def fetch_devices(api_url: str) -> list[dict]:
    """Get registered devices from the API."""
    resp = requests.get(f"{api_url}/devices")
    resp.raise_for_status()
    return resp.json()


def fetch_equipment(api_url: str) -> dict[str, dict]:
    """Get equipment indexed by ID."""
    resp = requests.get(f"{api_url}/equipment")
    resp.raise_for_status()
    return {e["id"]: e for e in resp.json()}


def run_simulator(api_url: str, interval: float):
    """Main simulation loop."""

    print(f"GPS Simulator starting...")
    print(f"  API: {api_url}")
    print(f"  Interval: {interval}s")
    print()

    # Fetch current devices and equipment
    devices = fetch_devices(api_url)
    equipment_map = fetch_equipment(api_url)

    if not devices:
        print("No devices found. Run seed.py first.")
        return

    # Initialize device states
    states: list[DeviceState] = []
    for dev in devices:
        eq = equipment_map.get(dev["equipment_id"])
        if not eq:
            continue

        state = DeviceState(
            device_id=dev["device_id"],
            equipment_id=dev["equipment_id"],
            equipment_type=eq["equipment_type"],
            lat=eq["latitude"],
            lng=eq["longitude"],
        )
        states.append(state)
        print(f"  [{state.device_id}] {eq['name']} ({eq['equipment_type']}) @ {state.lat:.4f}, {state.lng:.4f}")

    print(f"\nSimulating {len(states)} devices. Press Ctrl+C to stop.\n")
    print("-" * 60)

    tick_count = 0

    while True:
        tick_count += 1

        for state in states:
            state.tick(interval)
            payload = state.to_telemetry()

            try:
                resp = requests.post(
                    f"{api_url}/telemetry",
                    json=payload,
                    timeout=5,
                )

                status_icon = "+" if resp.status_code == 200 else "!"
                if tick_count % 5 == 0 or resp.status_code != 200:
                    print(
                        f"  [{status_icon}] {state.device_id}: "
                        f"({payload['latitude']:.4f}, {payload['longitude']:.4f}) "
                        f"{payload['speed']:.1f} km/h | "
                        f"engine={'ON' if payload['engine_on'] else 'OFF'} | "
                        f"signal={payload['signal_strength']}%"
                    )

            except requests.RequestException as e:
                print(f"  [!] {state.device_id}: Request failed - {e}")

        if tick_count % 5 == 0:
            print(f"  --- tick {tick_count} ({tick_count * interval:.0f}s elapsed) ---")

        time.sleep(interval)


# --------------------------------------------------
# Entry Point
# --------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GPS Telemetry Simulator")
    parser.add_argument(
        "--interval", "-i",
        type=float,
        default=DEFAULT_INTERVAL,
        help=f"Seconds between telemetry updates (default: {DEFAULT_INTERVAL})"
    )
    parser.add_argument(
        "--api-url", "-u",
        type=str,
        default=DEFAULT_API_URL,
        help=f"Backend API URL (default: {DEFAULT_API_URL})"
    )

    args = parser.parse_args()

    try:
        run_simulator(args.api_url, args.interval)
    except KeyboardInterrupt:
        print("\n\nSimulator stopped.")
    except requests.ConnectionError:
        print(f"\nCould not connect to {args.api_url}. Is the backend running?")
