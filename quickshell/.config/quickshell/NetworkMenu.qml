pragma ComponentBehavior: Bound

import QtQuick
import "Colors.js" as Colors
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Networking

PopupWindow {
    id: popup
    required property var panel
    required property Item anchorItem
    required property string wiredInterface
    readonly property var wifiDevice: Networking.devices.values.find(device => device.type === DeviceType.Wifi) ?? null
    readonly property var wiredDevice: Networking.devices.values.find(device => device.type === DeviceType.Wired && device.connected) ?? null
    readonly property var activeNetwork: wifiDevice?.networks.values.find(network => network.connected) ?? null
    readonly property var wifiNetworks: wifiDevice?.networks.values ?? []
    readonly property var connectedNetworks: wifiNetworks.filter(network => network.connected)
    readonly property var knownNetworks: wifiNetworks.filter(network => !network.connected && network.known)
    readonly property var availableNetworks: wifiNetworks.filter(network => !network.connected && !network.known)
    readonly property var bandOptions: ["2.4", "5", "6"].filter(band => (details.available ?? "").split(" ").includes(band))
    readonly property var activeDevice: wiredDevice ?? (activeNetwork ? wifiDevice : null)
    readonly property bool wiredConnected: !!wiredDevice || !!wiredInterface
    readonly property string interfaceName: wiredDevice?.name ?? (wiredInterface || activeDevice?.name || "")
    readonly property bool captivePortal: Networking.canCheckConnectivity && Networking.connectivityCheckEnabled && Networking.connectivity === NetworkConnectivity.Portal
    property var selectedNetwork: null
    property string error: ""
    property var details: ({})
    property real downloadRate: 0
    property real uploadRate: 0
    property real previousRx: -1
    property real previousTx: -1
    property real previousTime: 0
    property var pingHistory: []
    property string ping: "--"

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return "--";
        const units = ["B", "KiB", "MiB", "GiB", "TiB"];
        let value = bytes;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return value.toFixed(unit === 0 ? 0 : 1) + " " + units[unit];
    }

    function refresh() {
        if (!visible || !interfaceName || detailsProcess.running) return;
        detailsProcess.command = [Quickshell.shellPath("network-control"), "status", interfaceName, activeNetwork?.name ?? ""];
        detailsProcess.running = true;
    }

    function changeSetting(kind, value) {
        if (!interfaceName || actionProcess.running) return;
        error = "";
        actionProcess.command = [Quickshell.shellPath("network-control"), kind, interfaceName, value, details.available ?? ""];
        actionProcess.running = true;
    }

    onInterfaceNameChanged: {
        details = {};
        previousRx = -1;
        previousTx = -1;
        previousTime = 0;
        downloadRate = 0;
        uploadRate = 0;
        pingHistory = [];
        ping = "--";
        refresh();
    }

    anchor.item: anchorItem
    anchor.rect.y: anchorItem.height + 6
    implicitWidth: 380
    implicitHeight: Math.min(menuContent.implicitHeight + 127, panel.screen.height - panel.height - 12)
    grabFocus: true
    color: Colors.background

    onVisibleChanged: {
        if (visible) {
            refresh();
            if (Networking.canCheckConnectivity && Networking.connectivityCheckEnabled) Networking.checkConnectivity();
        }
        else {
            selectedNetwork = null;
            password.text = "";
            error = "";
        }
    }

    Binding {
        target: popup.wifiDevice
        property: "scannerEnabled"
        value: popup.visible && Networking.wifiEnabled
    }

    Connections {
        target: popup.selectedNetwork
        function onConnectionFailed(reason) {
            popup.error = "Connection failed: " + ConnectionFailReason.toString(reason);
        }
    }

    Timer {
        interval: 2000
        repeat: true
        running: popup.visible && !!popup.interfaceName
        onTriggered: popup.refresh()
    }

    Timer {
        interval: 5000
        repeat: true
        running: popup.visible && !!popup.interfaceName
        triggeredOnStart: true
        onTriggered: {
            if (!pingProcess.running) pingProcess.running = true;
        }
    }

    Process {
        id: detailsProcess
        stdout: StdioCollector { id: detailsOutput }
        onExited: (code) => {
            if (code !== 0 || detailsProcess.command[2] !== popup.interfaceName) return;
            const next = {};
            for (const line of detailsOutput.text.trim().split("\n")) {
                const separator = line.indexOf("\t");
                if (separator >= 0) next[line.slice(0, separator)] = line.slice(separator + 1);
            }
            const now = Date.now();
            const rx = Number(next.rx);
            const tx = Number(next.tx);
            const seconds = (now - popup.previousTime) / 1000;
            if (popup.previousRx >= 0 && seconds > 0 && Number.isFinite(rx) && Number.isFinite(tx)) {
                popup.downloadRate = Math.max(0, (rx - popup.previousRx) / seconds);
                popup.uploadRate = Math.max(0, (tx - popup.previousTx) / seconds);
            }
            popup.previousRx = rx;
            popup.previousTx = tx;
            popup.previousTime = now;
            popup.details = next;
        }
    }

    Process {
        id: pingProcess
        command: ["ping", "-n", "-c", "1", "-W", "1", "1.1.1.1"]
        stdout: StdioCollector { id: pingOutput }
        onExited: (code) => {
            const result = pingOutput.text.match(/time=([\d.]+)/);
            popup.ping = code === 0 && result ? result[1] + " ms" : "--";
            popup.pingHistory = popup.pingHistory.concat([code === 0]).slice(-10);
        }
    }

    Process {
        id: actionProcess
        stdout: StdioCollector { id: actionOutput }
        stderr: StdioCollector { id: actionError }
        onExited: (code) => {
            if (code !== 0) popup.error = actionError.text.trim() || "Could not change network settings";
            popup.refresh();
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
            text: popup.wiredConnected ? "󰈀" : popup.activeNetwork ? "󰖩" : "󰖪"
            color: Colors.foreground
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
                width: parent.width
                text: popup.wiredConnected ? "Ethernet" + (Number(popup.details.speed) > 0 ? " (" + popup.details.speed + " Mbit)" : "") : popup.activeNetwork?.name || "Disconnected"
                elide: Text.ElideRight
                color: Colors.foreground
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 22
                font.bold: true
            }
            Text {
                text: popup.wiredConnected ? "CONNECTED" : popup.activeNetwork ? "WI-FI CONNECTED" : "NOT CONNECTED"
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
            visible: !!popup.wifiDevice
            width: 44
            height: 24
            color: Networking.wifiEnabled ? Colors.accent : Colors.border
            opacity: Networking.wifiHardwareEnabled ? 1 : 0.5

            Rectangle {
                x: Networking.wifiEnabled ? parent.width - width - 3 : 3
                anchors.verticalCenter: parent.verticalCenter
                width: 18
                height: 18
                color: Colors.background
            }
            MouseArea {
                anchors.fill: parent
                enabled: Networking.wifiHardwareEnabled
                cursorShape: Qt.PointingHandCursor
                onClicked: Networking.wifiEnabled = !Networking.wifiEnabled
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
                visible: !!popup.interfaceName
                width: parent.width
                spacing: 7

                Repeater {
                    model: [
                        { label: "Ping", value: popup.ping },
                        { label: "Packet Loss", value: popup.pingHistory.length ? Math.round(100 * popup.pingHistory.filter(ok => !ok).length / popup.pingHistory.length) + "%" : "--" },
                        { label: "Receiving", value: popup.formatBytes(popup.downloadRate) + "/s" },
                        { label: "Sending", value: popup.formatBytes(popup.uploadRate) + "/s" },
                        { label: "Downloaded", value: popup.formatBytes(Number(popup.details.rx)) },
                        { label: "Uploaded", value: popup.formatBytes(Number(popup.details.tx)) },
                        { label: "IP Address", value: popup.details.ip || "--" },
                        { label: "Gateway", value: popup.details.gateway || "--" }
                    ]
                    Item {
                        required property var modelData
                        width: menuContent.width
                        height: 22
                        Text {
                            anchors.left: parent.left
                            text: parent.modelData.label
                            color: Colors.foregroundDim
                            font.family: "Iosevka Nerd Font"
                            font.pixelSize: 16
                        }
                        Text {
                            anchors.right: parent.right
                            text: parent.modelData.value
                            color: Colors.foreground
                            font.family: "Iosevka Nerd Font"
                            font.pixelSize: 16
                        }
                    }
                }
            }

            Rectangle {
                visible: !!popup.interfaceName
                width: parent.width
                height: 1
                color: Colors.border
            }

            Column {
                visible: !!popup.activeNetwork && !popup.wiredConnected
                width: parent.width
                spacing: 10

                Item {
                    width: parent.width
                    height: 25
                    Text {
                        anchors.left: parent.left
                        text: "WI-FI BAND"
                        color: Colors.foregroundDim
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: 15
                        font.bold: true
                        font.letterSpacing: 1.2
                    }
                    Text {
                        anchors.right: parent.right
                        text: "AUTOMATIC  " + (popup.details.band === "auto" ? "" : "")
                        color: Colors.foreground
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: 15
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            enabled: !actionProcess.running
                            onClicked: popup.changeSetting("band", "auto")
                        }
                    }
                }
                Row {
                    visible: !!popup.details.available
                    width: parent.width
                    spacing: 6
                    Repeater {
                        model: popup.bandOptions
                        Rectangle {
                            required property string modelData
                            width: (menuContent.width - 6 * (popup.bandOptions.length - 1)) / popup.bandOptions.length
                            height: 35
                            color: popup.details.band === modelData ? Colors.border : Colors.hover
                            border.color: Colors.accent
                            Text {
                                anchors.centerIn: parent
                                text: parent.modelData + " GHz"
                                color: Colors.foreground
                                font.family: "Iosevka Nerd Font"
                                font.pixelSize: 16
                            }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                enabled: !actionProcess.running
                                onClicked: popup.changeSetting("band", parent.modelData)
                            }
                        }
                    }
                }
            }

            Rectangle {
                visible: popup.captivePortal
                width: parent.width
                height: 40
                color: portalMouse.containsMouse ? Colors.border : Colors.hover
                border.color: Colors.danger
                Text {
                    anchors.centerIn: parent
                    text: "Sign in to network"
                    color: Colors.danger
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 19
                }
                MouseArea {
                    id: portalMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: Quickshell.execDetached(["xdg-open", "http://ping.archlinux.org/nm-check.txt"])
                }
            }

            Text {
                visible: popup.wiredConnected
                text: "󰈀  " + popup.interfaceName + " connected"
                color: Colors.foregroundDim
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 17
            }

            Text {
                visible: (!popup.wifiDevice && !popup.wiredConnected) || (!!popup.wifiDevice && (!Networking.wifiHardwareEnabled || !Networking.wifiEnabled))
                text: !popup.wifiDevice ? "No Wi-Fi adapter" : !Networking.wifiHardwareEnabled ? "Wi-Fi is hardware disabled" : "Wi-Fi is off"
                color: Colors.muted
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 19
            }

            Column {
                visible: !!popup.wifiDevice && Networking.wifiEnabled
                width: parent.width
                spacing: 10

                Repeater {
                    model: [
                        { title: "CONNECTED", networks: popup.connectedNetworks },
                        { title: "KNOWN NETWORKS", networks: popup.knownNetworks },
                        { title: "AVAILABLE NETWORKS", networks: popup.availableNetworks }
                    ]

                    Column {
                        required property var modelData
                        visible: modelData.networks.length > 0
                        width: menuContent.width
                        spacing: 4

                        Text {
                            text: parent.modelData.title
                            color: Colors.foregroundDim
                            font.family: "Iosevka Nerd Font"
                            font.pixelSize: 15
                            font.bold: true
                            font.letterSpacing: 1.2
                        }

                        Repeater {
                            model: parent.modelData.networks
                            NetworkRow {
                                required property var modelData
                                width: menuContent.width
                                network: modelData
                                onSelected: {
                                    popup.error = "";
                                    popup.selectedNetwork = network;
                                    password.text = "";
                                }
                                onAttempted: {
                                    popup.error = "";
                                    popup.selectedNetwork = network;
                                }
                            }
                        }
                    }
                }
            }

            Text {
                visible: !!popup.wifiDevice && Networking.wifiEnabled && popup.wifiNetworks.length === 0
                text: "Scanning for networks…"
                color: Colors.muted
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 19
            }

            Column {
                visible: !!popup.selectedNetwork && !popup.selectedNetwork.known && popup.selectedNetwork.security !== WifiSecurityType.Open
                width: parent.width
                spacing: 10

                Text {
                    text: "Connect to " + (popup.selectedNetwork?.name ?? "")
                    elide: Text.ElideRight
                    width: parent.width
                    color: Colors.foreground
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 19
                }

                TextField {
                    id: password
                    visible: popup.selectedNetwork?.security === WifiSecurityType.WpaPsk || popup.selectedNetwork?.security === WifiSecurityType.Wpa2Psk || popup.selectedNetwork?.security === WifiSecurityType.Sae
                    width: parent.width
                    echoMode: TextInput.Password
                    placeholderText: "Wi-Fi password"
                    color: Colors.foreground
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 19
                    background: Rectangle {
                        color: Colors.hover
                        border.color: Colors.accent
                    }
                    onAccepted: connectButton.clicked()
                }

                Text {
                    visible: !password.visible
                    text: "This network needs a different authentication method"
                    width: parent.width
                    wrapMode: Text.Wrap
                    color: Colors.foregroundDim
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 16
                }

                Rectangle {
                    id: connectButton
                    visible: password.visible
                    width: parent.width
                    height: 40
                    color: connectMouse.containsMouse ? Colors.border : Colors.hover
                    signal clicked()
                    onClicked: {
                        if (popup.selectedNetwork && password.text.length > 0) {
                            popup.error = "";
                            popup.selectedNetwork.connectWithPsk(password.text);
                            password.text = "";
                        }
                    }
                    Text {
                        anchors.centerIn: parent
                        text: "Connect"
                        color: Colors.foreground
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: 19
                    }
                    MouseArea {
                        id: connectMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: connectButton.clicked()
                    }
                }
            }

            Text {
                visible: popup.error.length > 0
                text: popup.error
                width: parent.width
                wrapMode: Text.Wrap
                color: Colors.danger
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 16
            }
        }
    }
}
