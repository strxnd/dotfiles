pragma ComponentBehavior: Bound

import QtQuick
import "Colors.js" as Colors
import QtQuick.Controls
import Quickshell.Services.Pipewire

Column {
    id: section
    required property bool output
    property bool meterEnabled: false
    readonly property var current: output ? Pipewire.defaultAudioSink : Pipewire.defaultAudioSource
    width: parent.width
    spacing: 13

    PwNodePeakMonitor {
        id: micMonitor
        node: section.output ? null : section.current
        enabled: !section.output && section.meterEnabled && devices.count > 0 && !!section.current
    }

    Text {
        text: section.output ? "OUTPUT" : "INPUT"
        color: Colors.foregroundDim
        font.family: "Iosevka Nerd Font"
        font.pixelSize: 15
        font.bold: true
        font.letterSpacing: 1.2
    }

    Repeater {
        id: devices
        model: Pipewire.nodes.values.filter(node => node.audio && !node.isStream && node.isSink === section.output)

        Rectangle {
            id: device
            required property var modelData
            width: section.width
            height: 48
            color: device.modelData === section.current || deviceMouse.containsMouse ? Colors.hover : "transparent"

            Row {
                anchors.fill: parent
                anchors.leftMargin: 13
                anchors.rightMargin: 13
                spacing: 12

                Text {
                    id: deviceIcon
                    height: parent.height
                    verticalAlignment: Text.AlignVCenter
                    text: section.output ? "󰓃" : "󰍬"
                    color: device.modelData === section.current ? Colors.foreground : Colors.foregroundDim
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 19
                }

                Text {
                    width: parent.width - deviceIcon.width - parent.spacing
                    height: parent.height
                    verticalAlignment: Text.AlignVCenter
                    text: device.modelData.description || device.modelData.nickname || device.modelData.name
                    elide: Text.ElideRight
                    color: device.modelData === section.current ? Colors.foreground : Colors.foregroundDim
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 19
                }
            }

            MouseArea {
                id: deviceMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    if (section.output) Pipewire.preferredDefaultAudioSink = device.modelData;
                    else Pipewire.preferredDefaultAudioSource = device.modelData;
                }
            }
        }
    }

    Text {
        visible: devices.count === 0
        text: "No devices"
        color: Colors.muted
        font.family: "Iosevka Nerd Font"
        font.pixelSize: 19
    }

    Item {
        visible: !section.output && devices.count > 0
        width: section.width
        height: 32

        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            height: 6
            color: Colors.border

            Rectangle {
                width: Math.min(1, Math.sqrt(micMonitor.peak)) * parent.width
                height: parent.height
                color: Colors.foreground

                Behavior on width {
                    NumberAnimation { duration: 90 }
                }
            }
        }
    }

    Column {
        visible: devices.count > 0
        width: section.width
        spacing: 4

        Item {
            width: parent.width
            height: 24

            Text {
                anchors.left: parent.left
                height: parent.height
                verticalAlignment: Text.AlignVCenter
                text: "Volume"
                color: Colors.foregroundDim
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 19
            }

            Text {
                anchors.right: parent.right
                height: parent.height
                verticalAlignment: Text.AlignVCenter
                text: section.current?.audio ? Math.round(section.current.audio.volume * 100) + "%" : "--"
                color: Colors.foreground
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 19
            }
        }

        Slider {
            id: slider
            width: parent.width
            height: 32
            leftPadding: 0
            rightPadding: 0
            from: 0
            to: 1
            value: section.current?.audio?.volume ?? 0
            enabled: !!section.current?.ready && !!section.current?.audio
            onMoved: {
                if (section.current?.ready && section.current.audio) section.current.audio.volume = value;
            }

            background: Rectangle {
                x: slider.leftPadding
                y: slider.topPadding + slider.availableHeight / 2 - height / 2
                width: slider.availableWidth
                height: 6
                color: Colors.border

                Rectangle {
                    width: Math.max(0, sliderHandle.x - parent.x - 4)
                    height: parent.height
                    color: Colors.foreground
                }
            }

            handle: Rectangle {
                id: sliderHandle
                x: slider.leftPadding + slider.visualPosition * (slider.availableWidth - width)
                y: slider.topPadding + slider.availableHeight / 2 - height / 2
                width: 20
                height: 20
                color: Colors.foreground
            }
        }
    }
}
