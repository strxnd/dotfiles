pragma ComponentBehavior: Bound

import QtQuick
import "Colors.js" as Colors
import Quickshell
import Quickshell.Bluetooth

PopupWindow {
    id: popup
    required property var panel
    required property Item anchorItem
    readonly property var adapter: Bluetooth.defaultAdapter
    readonly property var devices: adapter?.devices.values ?? []
    readonly property var connectedDevices: devices.filter(device => device.connected)
    readonly property var knownDevices: devices.filter(device => !device.connected && device.paired)
    readonly property var discoveredDevices: devices.filter(device => !device.connected && !device.paired && !!device.deviceName && device.deviceName !== device.address)
    property bool scanningHere: false

    anchor.item: anchorItem
    anchor.rect.y: anchorItem.height + 6
    implicitWidth: 380
    implicitHeight: Math.min(menuContent.implicitHeight + 127, panel.screen.height - panel.height - 12)
    grabFocus: true
    color: Colors.background

    onVisibleChanged: {
        if (!adapter) return;
        if (visible && adapter.enabled && !adapter.discovering) {
            adapter.discovering = true;
            scanningHere = true;
        } else if (!visible && scanningHere) {
            adapter.discovering = false;
            scanningHere = false;
        }
    }

    Connections {
        target: popup.adapter
        function onEnabledChanged() {
            if (popup.visible && popup.adapter.enabled && !popup.adapter.discovering) {
                popup.adapter.discovering = true;
                popup.scanningHere = true;
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "transparent"
        border.width: 2
        border.color: Colors.accent
    }

    Item {
        id: hero
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: 19
        height: 48

        Text {
            id: heroIcon
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: !popup.adapter?.enabled ? "󰂲" : popup.connectedDevices.length > 0 ? "󰂱" : "󰂯"
            color: Colors.foreground
            opacity: popup.adapter?.enabled ? 1 : 0.5
            font.family: "Iosevka Nerd Font"
            font.pixelSize: 30
        }

        Column {
            anchors.left: heroIcon.right
            anchors.leftMargin: 14
            anchors.right: powerButton.left
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            Text {
                text: "Bluetooth"
                color: Colors.foreground
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 22
                font.bold: true
            }
            Text {
                text: !popup.adapter ? "NO ADAPTER" : !popup.adapter.enabled ? "TURNED OFF" : popup.connectedDevices.length > 0 ? popup.connectedDevices.length + " CONNECTED" : "SCANNING FOR DEVICES"
                color: Colors.foregroundDim
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 13
                font.bold: true
                font.letterSpacing: 1.2
            }
        }

        Rectangle {
            id: powerButton
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: 44
            height: 24
            color: popup.adapter?.enabled ? Colors.accent : Colors.border
            opacity: popup.adapter ? 1 : 0.5

            Rectangle {
                x: popup.adapter?.enabled ? parent.width - width - 3 : 3
                anchors.verticalCenter: parent.verticalCenter
                width: 18
                height: 18
                color: Colors.background
            }
            MouseArea {
                anchors.fill: parent
                enabled: !!popup.adapter
                cursorShape: Qt.PointingHandCursor
                onClicked: popup.adapter.enabled = !popup.adapter.enabled
            }
        }
    }

    Rectangle {
        id: heroDivider
        anchors.left: hero.left
        anchors.right: hero.right
        anchors.top: hero.bottom
        anchors.topMargin: 14
        height: 1
        color: Colors.border
    }

    Flickable {
        id: menuScroll
        anchors.top: heroDivider.bottom
        anchors.topMargin: 26
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.leftMargin: 19
        anchors.rightMargin: 19
        anchors.bottomMargin: 19
        clip: true
        contentWidth: width
        contentHeight: menuContent.implicitHeight
        interactive: contentHeight > height
        boundsBehavior: Flickable.StopAtBounds

        Column {
            id: menuContent
            width: menuScroll.width
            spacing: 13

            Column {
                visible: !!popup.adapter?.enabled && popup.connectedDevices.length > 0
                width: parent.width
                spacing: 10
                Text {
                    text: "CONNECTED"
                    color: Colors.foregroundDim
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 15
                    font.bold: true
                    font.letterSpacing: 1.2
                }
                Repeater {
                    model: popup.connectedDevices
                    BluetoothDeviceRow {
                        required property var modelData
                        width: menuContent.width
                        device: modelData
                    }
                }
            }

            Rectangle {
                visible: popup.connectedDevices.length > 0 && (popup.knownDevices.length > 0 || popup.discoveredDevices.length > 0)
                width: parent.width
                height: 1
                color: Colors.border
            }

            Column {
                visible: !!popup.adapter?.enabled && popup.knownDevices.length > 0
                width: parent.width
                spacing: 10
                Text {
                    text: "KNOWN DEVICES"
                    color: Colors.foregroundDim
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 15
                    font.bold: true
                    font.letterSpacing: 1.2
                }
                Repeater {
                    model: popup.knownDevices
                    BluetoothDeviceRow {
                        required property var modelData
                        width: menuContent.width
                        device: modelData
                    }
                }
            }

            Column {
                visible: !!popup.adapter?.enabled && popup.discoveredDevices.length > 0
                width: parent.width
                spacing: 10
                Text {
                    text: "DISCOVERED"
                    color: Colors.foregroundDim
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 15
                    font.bold: true
                    font.letterSpacing: 1.2
                }
                Repeater {
                    model: popup.discoveredDevices
                    BluetoothDeviceRow {
                        required property var modelData
                        width: menuContent.width
                        device: modelData
                    }
                }
            }

            Text {
                visible: !popup.adapter || !popup.adapter.enabled || (popup.connectedDevices.length === 0 && popup.knownDevices.length === 0 && popup.discoveredDevices.length === 0)
                text: !popup.adapter ? "No Bluetooth adapter" : !popup.adapter.enabled ? "Turn Bluetooth on to scan" : "Scanning for devices…"
                color: Colors.muted
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 19
            }
        }
    }
}
