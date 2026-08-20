import time
import random
import requests

from datetime import datetime

API_URL = "http://127.0.0.1:8000/telemetry"

EQUIPMENT_ID = "TR-001"

latitude = 18.5204
longitude = 73.8567


def generate_telemetry():

    global latitude, longitude

    state = random.choices(
        ["working", "idle", "offline"],
        weights=[70, 20, 10],
        k=1
    )[0]

    if state == "working":

        speed = random.uniform(5, 10)
        engine_on = True

        latitude += random.uniform(0.00005, 0.0001)
        longitude += random.uniform(0.00005, 0.0001)

    elif state == "idle":

        speed = 0
        engine_on = True

    else:

        speed = 0
        engine_on = False

    return {
        "equipment_id": EQUIPMENT_ID,
        "device_id": "GPS-TR-001",

        "latitude": latitude,
        "longitude": longitude,

        "speed": round(speed, 2),
        "engine_on": engine_on,

        "timestamp": datetime.now().isoformat(),

        "signal_strength": random.randint(75, 100)
    }


while True:

    telemetry = generate_telemetry()

    try:

        response = requests.post(
            API_URL,
            json=telemetry
        )

        print(
            f"State: "
            f"{'WORKING' if telemetry['engine_on'] and telemetry['speed'] > 0 else 'IDLE' if telemetry['engine_on'] else 'OFFLINE'}"
            f" | Lat: {telemetry['latitude']:.6f}"
            f" | Lon: {telemetry['longitude']:.6f}"
            f" | Speed: {telemetry['speed']}"
            f" | Response: {response.status_code}"
        )

    except requests.exceptions.RequestException as e:

        print(f"Could not connect to backend: {e}")

    time.sleep(5)