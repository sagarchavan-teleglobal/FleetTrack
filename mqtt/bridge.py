"""
MQTT-to-HTTP Bridge Service
Subscribes to MQTT telemetry topics and forwards data to the FastAPI backend.

Usage:
    pip install paho-mqtt requests
    python bridge.py

Environment:
    MQTT_HOST      - Broker host (default: localhost)
    MQTT_PORT      - Broker port (default: 1883)
    API_URL        - Backend URL (default: http://localhost:8000)
"""

import os
import json
import time

import paho.mqtt.client as mqtt
import requests

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
API_URL = os.getenv("API_URL", "http://localhost:8000")

TELEMETRY_TOPIC = "fleet/telemetry/#"

# ─────────────────────────────────────────────
# MQTT Callbacks
# ─────────────────────────────────────────────

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"  ✓ Connected to MQTT broker at {MQTT_HOST}:{MQTT_PORT}")
        client.subscribe(TELEMETRY_TOPIC)
        print(f"  ✓ Subscribed to: {TELEMETRY_TOPIC}")
    else:
        print(f"  ✗ Connection failed with code: {rc}")


def on_message(client, userdata, msg):
    """
    Receive MQTT message and POST to FastAPI backend.
    Expected topic: fleet/telemetry/{equipment_id}
    Expected payload: JSON matching the Telemetry schema
    """
    try:
        payload = json.loads(msg.payload.decode())
        topic_parts = msg.topic.split("/")
        equipment_id = topic_parts[-1] if len(topic_parts) >= 3 else "unknown"

        # Forward to backend API
        response = requests.post(
            f"{API_URL}/telemetry",
            json=payload,
            timeout=5
        )

        status = "OK" if response.status_code == 200 else f"ERR {response.status_code}"
        print(
            f"  [{equipment_id}] "
            f"MQTT → API | "
            f"Lat: {payload.get('latitude', 0):.6f} | "
            f"Lon: {payload.get('longitude', 0):.6f} | "
            f"Speed: {payload.get('speed', 0):.1f} | "
            f"{status}"
        )

    except json.JSONDecodeError:
        print(f"  ✗ Invalid JSON on topic: {msg.topic}")
    except requests.exceptions.RequestException as e:
        print(f"  ✗ API error: {e}")
    except Exception as e:
        print(f"  ✗ Unexpected error: {e}")


def on_disconnect(client, userdata, rc, properties=None):
    print(f"  ⚠ Disconnected from MQTT broker (rc={rc}). Reconnecting...")


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main():
    print("═══════════════════════════════════════════════")
    print("  MQTT → HTTP Bridge")
    print(f"  Broker: {MQTT_HOST}:{MQTT_PORT}")
    print(f"  API:    {API_URL}")
    print(f"  Topic:  {TELEMETRY_TOPIC}")
    print("═══════════════════════════════════════════════")
    print()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    # Auto-reconnect
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
            client.loop_forever()
        except ConnectionRefusedError:
            print(f"  ⚠ Cannot reach MQTT broker. Retrying in 5s...")
            time.sleep(5)
        except KeyboardInterrupt:
            print("\n  Bridge stopped.")
            break


if __name__ == "__main__":
    main()
