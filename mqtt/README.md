# MQTT Broker (Mosquitto)

## Start the broker

```bash
cd mqtt
docker-compose up -d
```

## Verify it's running

```bash
docker ps | grep mosquitto
```

## MQTT Topic Structure

```
fleet/telemetry/{equipment_id}    — GPS telemetry data
fleet/status/{equipment_id}       — Equipment status changes
fleet/alerts                      — System alerts
```

## Test with mosquitto_pub/sub

```bash
# Subscribe to all telemetry
docker exec fleet_mqtt_broker mosquitto_sub -t "fleet/telemetry/#"

# Publish a test message
docker exec fleet_mqtt_broker mosquitto_pub -t "fleet/telemetry/TR-001" -m '{"equipment_id":"TR-001","latitude":18.52}'
```

## Ports

- **1883** — MQTT (for devices and bridge service)
- **9001** — MQTT over WebSocket (for browser clients)

## Production Notes

- Add username/password authentication
- Enable TLS (port 8883)
- Set up ACLs per device
- Use persistent sessions for QoS 1/2
