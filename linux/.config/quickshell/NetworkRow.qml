pragma ComponentBehavior: Bound

import QtQuick
import "Colors.js" as Colors
import Quickshell.Networking

Rectangle {
    id: row
    required property var network
    signal selected()
    signal attempted()
    height: 48
    color: network.connected || rowMouse.containsMouse ? Colors.hover : "transparent"

    Text {
        id: icon
        anchors.left: parent.left
        anchors.leftMargin: 13
        anchors.verticalCenter: parent.verticalCenter
        text: row.network.signalStrength > 0.75 ? "󰤨" : row.network.signalStrength > 0.5 ? "󰤥" : row.network.signalStrength > 0.25 ? "󰤢" : "󰤟"
        color: Colors.foreground
        font.family: "Iosevka Nerd Font"
        font.pixelSize: 19
    }

    Text {
        anchors.left: icon.right
        anchors.leftMargin: 12
        anchors.right: status.left
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: row.network.name || "Hidden network"
        elide: Text.ElideRight
        color: Colors.foreground
        font.family: "Iosevka Nerd Font"
        font.pixelSize: 19
    }

    Text {
        id: status
        anchors.right: parent.right
        anchors.rightMargin: 13
        anchors.verticalCenter: parent.verticalCenter
        text: row.network.connected ? "Connected" : row.network.stateChanging ? "Connecting…" : Math.round(row.network.signalStrength * 100) + "%" + (row.network.security === WifiSecurityType.Open ? "" : "  󰌾")
        color: Colors.foregroundDim
        font.family: "Iosevka Nerd Font"
        font.pixelSize: 16
    }

    MouseArea {
        id: rowMouse
        anchors.fill: parent
        hoverEnabled: true
        enabled: !row.network.stateChanging
        cursorShape: Qt.PointingHandCursor
        onClicked: {
            if (row.network.connected) row.network.disconnect();
            else if (row.network.known || row.network.security === WifiSecurityType.Open) {
                row.attempted();
                row.network.connect();
            } else row.selected();
        }
    }
}
