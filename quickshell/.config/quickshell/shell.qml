pragma ComponentBehavior: Bound

import QtQuick
import "Colors.js" as Colors
import Quickshell
import Quickshell.Io
import Quickshell.Networking
import Quickshell.Bluetooth
import Quickshell.Services.Pipewire
import Quickshell.Services.SystemTray

ShellRoot {
    id: root
    property string wiredInterface: ""
    property var tagsByMonitor: ({})
    property var openMenu: null

    IpcHandler {
        target: "launcher"
        function toggle(): void {
            if (root.openMenu) root.openMenu.visible = false;
            appLauncher.visible = !appLauncher.visible;
        }
    }

    AppLauncher {
        id: appLauncher
        onDismissed: visible = false
    }

    function toggleMenu(menu) {
        if (openMenu === menu && menu.visible) {
            menu.visible = false;
            return;
        }
        if (openMenu) openMenu.visible = false;
        openMenu = menu;
        menu.visible = true;
    }

    function menuVisibilityChanged(menu) {
        if (!menu.visible && openMenu === menu) openMenu = null;
    }

    Process {
        id: tagWatch
        command: ["mmsg", "watch", "all-tags"]
        running: true
        stdout: SplitParser {
            onRead: data => {
                try {
                    const monitors = JSON.parse(data).all_tags;
                    const tags = {};
                    for (const monitor of monitors) tags[monitor.monitor] = monitor.tags;
                    root.tagsByMonitor = tags;
                } catch (error) {
                    console.warn("Could not parse Mango tag update:", error);
                }
            }
        }
    }

    Timer {
        interval: 2000
        running: !tagWatch.running
        repeat: true
        onTriggered: tagWatch.running = true
    }

    Process {
        id: routeProcess
        command: [Quickshell.shellPath("network-control"), "route"]
        stdout: StdioCollector { id: routeOutput }
        onExited: (code) => root.wiredInterface = code === 0 ? routeOutput.text.trim() : ""
    }

    Timer {
        interval: 5000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            if (!routeProcess.running) routeProcess.running = true;
        }
    }

    function focusWorkspace(number) {
        Quickshell.execDetached(["mmsg", "dispatch", "view," + number]);
    }

    PwObjectTracker {
        objects: [Pipewire.defaultAudioSink, Pipewire.defaultAudioSource]
    }

    Variants {
        model: Quickshell.screens

        delegate: Component {
            PanelWindow {
                id: bar
                required property var modelData
                screen: modelData

                anchors {
                    top: true
                    left: true
                    right: true
                }
                implicitHeight: 30
                color: Colors.background

                TextMetrics {
                    id: archMetrics
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 16
                    text: "󰣇"
                }

                TextMetrics {
                    id: volumeMetrics
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 16
                    text: volume.icon
                }

                Row {
                    id: workspaces
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    height: bar.height
                    spacing: 10

                    Text {
                        text: "󰣇"
                        height: parent.height
                        verticalAlignment: Text.AlignVCenter
                        color: Colors.foreground
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: 16
                    }

                    Row {
                        height: parent.height
                        spacing: 12

                        Repeater {
                            model: root.tagsByMonitor[bar.screen.name] ?? []

                            Text {
                                required property var modelData
                                text: modelData.index
                                height: parent.height
                                verticalAlignment: Text.AlignVCenter
                                color: modelData.is_active ? Colors.foreground : Colors.muted
                                font.family: "Iosevka Nerd Font"
                                font.pixelSize: 14

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.focusWorkspace(parent.modelData.index)
                                }
                            }
                        }
                    }
                }

                Text {
                    id: clock
                    property date now: new Date()
                    anchors.centerIn: parent
                    height: bar.height
                    verticalAlignment: Text.AlignVCenter
                    text: Qt.formatDateTime(now, "dddd HH:mm")
                    color: Colors.foreground
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 14

                    Timer {
                        interval: 15000
                        running: true
                        repeat: true
                        onTriggered: clock.now = new Date()
                    }
                }

                Row {
                    anchors.right: parent.right
                    anchors.rightMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    height: bar.height
                    spacing: 14

                    Row {
                        height: parent.height
                        spacing: 8

                        Repeater {
                            model: SystemTray.items

                            Item {
                                id: trayIcon
                                required property var modelData
                                width: 24
                                height: parent.height

                                Image {
                                    anchors.centerIn: parent
                                    source: trayIcon.modelData.icon
                                    width: 18
                                    height: 18
                                    fillMode: Image.PreserveAspectFit
                                }

                                TrayMenu {
                                    id: trayMenu
                                    trayItem: trayIcon.modelData
                                    panel: bar
                                    anchorItem: trayIcon
                                }

                                Connections {
                                    target: trayMenu
                                    function onVisibleChanged() { root.menuVisibilityChanged(trayMenu); }
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
                                    cursorShape: Qt.PointingHandCursor

                                    onClicked: mouse => {
                                        if (mouse.button === Qt.MiddleButton) {
                                            trayIcon.modelData.secondaryActivate();
                                        } else if (mouse.button === Qt.RightButton || trayIcon.modelData.onlyMenu) {
                                            if (trayIcon.modelData.hasMenu) root.toggleMenu(trayMenu);
                                        } else {
                                            trayIcon.modelData.activate();
                                        }
                                    }
                                    onWheel: wheel => {
                                        if (wheel.angleDelta.y) trayIcon.modelData.scroll(wheel.angleDelta.y, false);
                                        if (wheel.angleDelta.x) trayIcon.modelData.scroll(wheel.angleDelta.x, true);
                                    }
                                }
                            }
                        }
                    }

                    Text {
                        id: networkIcon
                        height: parent.height
                        verticalAlignment: Text.AlignVCenter
                        readonly property var wifi: Networking.devices.values.find(device => device.type === DeviceType.Wifi) ?? null
                        readonly property bool wired: !!root.wiredInterface || Networking.devices.values.some(device => device.type === DeviceType.Wired && device.connected)
                        text: wired ? "󰈀" : wifi?.connected ? "󰖩" : "󰖪"
                        color: Colors.foreground
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: 16

                        NetworkMenu {
                            id: networkMenu
                            panel: bar
                            anchorItem: networkIcon
                            wiredInterface: root.wiredInterface
                        }

                        Connections {
                            target: networkMenu
                            function onVisibleChanged() { root.menuVisibilityChanged(networkMenu); }
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.toggleMenu(networkMenu)
                        }
                    }

                    Text {
                        id: bluetoothIcon
                        height: parent.height
                        verticalAlignment: Text.AlignVCenter
                        text: !Bluetooth.defaultAdapter?.enabled ? "󰂲" : Bluetooth.defaultAdapter.devices.values.some(device => device.connected) ? "󰂱" : "󰂯"
                        color: Colors.foreground
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: 16

                        BluetoothMenu {
                            id: bluetoothMenu
                            panel: bar
                            anchorItem: bluetoothIcon
                        }

                        Connections {
                            target: bluetoothMenu
                            function onVisibleChanged() { root.menuVisibilityChanged(bluetoothMenu); }
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.toggleMenu(bluetoothMenu)
                        }
                    }

                    Text {
                        id: volume
                        height: parent.height
                        verticalAlignment: Text.AlignVCenter
                        readonly property var sink: Pipewire.defaultAudioSink
                        readonly property string icon: !sink?.audio || sink.audio.muted || sink.audio.volume === 0 ? "󰖁"
                            : sink.audio.volume < 0.33 ? "󰕿"
                            : sink.audio.volume < 0.66 ? "󰖀" : "󰕾"
                        text: icon
                        color: Colors.foreground
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: volumeMetrics.tightBoundingRect.height > 0
                            ? Math.round(16 * archMetrics.tightBoundingRect.height / volumeMetrics.tightBoundingRect.height)
                            : 16

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.toggleMenu(audioMenu)
                            onWheel: wheel => {
                                if (volume.sink?.ready && volume.sink.audio) {
                                    const step = wheel.angleDelta.y > 0 ? 0.05 : -0.05;
                                    volume.sink.audio.volume = Math.max(0, Math.min(1, volume.sink.audio.volume + step));
                                }
                            }
                        }
                    }

                }

                PopupWindow {
                    id: audioMenu
                    onVisibleChanged: root.menuVisibilityChanged(audioMenu)
                    anchor.item: volume
                    anchor.rect.y: volume.height + 6
                    implicitWidth: 380
                    implicitHeight: Math.min(menuContent.implicitHeight + 127, bar.screen.height - bar.height - 12)
                    grabFocus: true
                    color: Colors.background

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
                            text: volume.icon
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
                                text: "Audio"
                                color: Colors.foreground
                                font.family: "Iosevka Nerd Font"
                                font.pixelSize: 22
                                font.bold: true
                            }
                            Text {
                                text: !volume.sink?.audio ? "NO OUTPUT DEVICE" : volume.sink.audio.muted ? "MUTED" : "OUTPUT AT " + Math.round(volume.sink.audio.volume * 100) + "%"
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
                            color: volume.sink?.audio && !volume.sink.audio.muted ? Colors.accent : Colors.border
                            opacity: volume.sink?.ready && volume.sink.audio ? 1 : 0.5

                            Rectangle {
                                x: volume.sink?.audio && !volume.sink.audio.muted ? parent.width - width - 3 : 3
                                anchors.verticalCenter: parent.verticalCenter
                                width: 18
                                height: 18
                                color: Colors.background
                            }
                            MouseArea {
                                anchors.fill: parent
                                enabled: !!volume.sink?.ready && !!volume.sink.audio
                                cursorShape: Qt.PointingHandCursor
                                onClicked: volume.sink.audio.muted = !volume.sink.audio.muted
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

                            AudioSection {
                                output: true
                            }

                            Rectangle {
                                width: parent.width
                                height: 1
                                color: Colors.border
                            }

                            AudioSection {
                                output: false
                                meterEnabled: audioMenu.visible
                            }
                        }
                    }
                }
            }
        }
    }
}
