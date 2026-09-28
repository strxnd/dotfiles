pragma ComponentBehavior: Bound

import QtQuick
import "Colors.js" as Colors
import Quickshell.Bluetooth

Rectangle {
    id: row
    required property var device
    readonly property bool busy: device.pairing || device.state === BluetoothDeviceState.Connecting || device.state === BluetoothDeviceState.Disconnecting
    height: 54
    color: device.connected || rowMouse.containsMouse ? Colors.hover : "transparent"

    MouseArea {
        id: rowMouse
        anchors.fill: parent
        hoverEnabled: true
        enabled: !row.busy
        cursorShape: Qt.PointingHandCursor
        onClicked: {
            if (row.device.connected) row.device.disconnect();
            else if (row.device.paired) row.device.connect();
            else row.device.pair();
        }
    }

    Text {
        id: icon
        anchors.left: parent.left
        anchors.leftMargin: 13
        anchors.verticalCenter: parent.verticalCenter
        text: row.device.connected ? "󰂱" : "󰂯"
        color: Colors.foreground
        font.family: "Iosevka Nerd Font"
        font.pixelSize: 22
    }

    Column {
        anchors.left: icon.right
        anchors.leftMargin: 12
        anchors.right: forgetButton.visible ? forgetButton.left : parent.right
        anchors.rightMargin: 13
        anchors.verticalCenter: parent.verticalCenter
        spacing: 2

        Text {
            width: parent.width
            text: row.device.name || row.device.deviceName || row.device.address
            elide: Text.ElideRight
            color: Colors.foreground
            font.family: "Iosevka Nerd Font"
            font.pixelSize: 19
        }
        Text {
            visible: text !== ""
            text: row.device.pairing ? "Pairing…" : row.device.state === BluetoothDeviceState.Connecting ? "Connecting…" : row.device.state === BluetoothDeviceState.Disconnecting ? "Disconnecting…" : row.device.connected ? row.device.batteryAvailable ? Math.round(row.device.battery * 100) + "%" : "Connected" : ""
            color: Colors.foregroundDim
            font.family: "Iosevka Nerd Font"
            font.pixelSize: 14
        }
    }

    Text {
        id: forgetButton
        visible: row.device.paired && rowMouse.containsMouse
        anchors.right: parent.right
        anchors.rightMargin: 13
        anchors.verticalCenter: parent.verticalCenter
        text: "󰅙"
        color: Colors.foreground
        font.family: "Iosevka Nerd Font"
        font.pixelSize: 19

        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: row.device.forget()
        }
    }
}
