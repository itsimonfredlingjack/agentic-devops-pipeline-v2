#!/bin/bash
# Install SEJFA systemd services
# Usage: sudo bash scripts/systemd/install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing SEJFA systemd services..."

# Copy service files
for svc in sejfa-voice-pipeline sejfa-monitor-api sejfa-loop-runner; do
    if [ -f "$SCRIPT_DIR/$svc.service" ]; then
        cp "$SCRIPT_DIR/$svc.service" /etc/systemd/system/
        echo "  Installed $svc.service"
    fi
done

# Copy template service (instance-based) if it exists
if [ -f "$SCRIPT_DIR/sejfa-reverse-tunnel@.service" ]; then
    cp "$SCRIPT_DIR/sejfa-reverse-tunnel@.service" /etc/systemd/system/
    echo "  Installed sejfa-reverse-tunnel@.service"
fi

# Reload systemd
systemctl daemon-reload

echo ""
echo "Services installed. To enable and start:"
echo ""
echo "  # Hetzner services (voice pipeline + monitor API)"
echo "  sudo systemctl enable --now sejfa-voice-pipeline"
echo "  sudo systemctl enable --now sejfa-monitor-api"
echo ""
echo "  # Mac service (loop runner — polls Hetzner, runs Claude locally)"
echo "  sudo systemctl enable --now sejfa-loop-runner"
echo ""
echo "  # Check status"
echo "  systemctl status sejfa-voice-pipeline sejfa-monitor-api"
echo ""
echo "  # View logs"
echo "  journalctl -u sejfa-voice-pipeline -f"
echo "  journalctl -u sejfa-monitor-api -f"
echo ""
echo "IMPORTANT: Create .env first!"
echo "  cp /opt/sejfa/.env.example /opt/sejfa/.env"
echo "  nano /opt/sejfa/.env  # Fill in credentials"
