#!/bin/bash

# Get Bluetooth status
powered=$(bluetoothctl show | grep "Powered:" | awk '{print $2}')
if [[ "$powered" != "yes" ]]; then
    echo '{"text": "󰂲", "tooltip": "Bluetooth is off", "class": "off"}'
    exit
fi

# Get connected device names
connected=$(bluetoothctl devices Connected | cut -d ' ' -f 3-)
if [[ -n "$connected" ]]; then
    echo '{"text": "󰂯 '$connected'", "tooltip": "Connected to: '$connected'", "class": "connected"}'
else
    echo '{"text": "󰂯", "tooltip": "Bluetooth is on", "class": "on"}'
fi

