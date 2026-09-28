pragma ComponentBehavior: Bound

import QtQuick
import "Colors.js" as Colors
import Quickshell

PopupWindow {
    id: popup
    required property var trayItem
    required property var panel
    required property Item anchorItem
    property var currentMenu: trayItem?.menu ?? null
    property var history: []

    anchor.item: anchorItem
    anchor.rect.y: anchorItem.height + 6
    implicitWidth: 320
    implicitHeight: Math.min(menuContent.implicitHeight + 38, panel.screen.height - panel.height - 12)
    grabFocus: true
    color: Colors.background

    onVisibleChanged: {
        if (visible) {
            history = [];
            currentMenu = trayItem?.menu ?? null;
        }
    }

    QsMenuOpener {
        id: menuOpener
        menu: popup.currentMenu
    }

    Rectangle {
        anchors.fill: parent
        color: "transparent"
        border.width: 2
        border.color: Colors.accent
    }

    Flickable {
        id: menuScroll
        anchors.fill: parent
        anchors.margins: 19
        clip: true
        contentWidth: width
        contentHeight: menuContent.implicitHeight
        interactive: contentHeight > height
        boundsBehavior: Flickable.StopAtBounds

        Column {
            id: menuContent
            width: menuScroll.width
            spacing: 2

            Item {
                id: backRow
                visible: popup.history.length > 0
                width: parent.width
                height: 40

                Rectangle {
                    anchors.fill: parent
                    visible: backMouse.containsMouse
                    color: Colors.hover
                }

                Text {
                    anchors.fill: parent
                    anchors.leftMargin: 10
                    anchors.rightMargin: 10
                    verticalAlignment: Text.AlignVCenter
                    text: "‹  " + (popup.currentMenu?.text ?? "Back")
                    elide: Text.ElideRight
                    color: Colors.foreground
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 16
                }

                MouseArea {
                    id: backMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: {
                        const stack = popup.history.slice();
                        popup.currentMenu = stack.pop();
                        popup.history = stack;
                        menuScroll.contentY = 0;
                    }
                }
            }

            Rectangle {
                visible: backRow.visible
                width: parent.width
                height: 1
                color: Colors.border
            }

            Repeater {
                id: entries
                model: menuOpener.children

                Item {
                    id: entry
                    required property var modelData
                    width: menuContent.width
                    height: modelData.isSeparator ? 13 : 40

                    Rectangle {
                        visible: entry.modelData.isSeparator
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width
                        height: 1
                        color: Colors.border
                    }

                    Rectangle {
                        visible: !entry.modelData.isSeparator && entryMouse.containsMouse && entry.modelData.enabled
                        anchors.fill: parent
                        color: Colors.hover
                    }

                    Item {
                        id: leadingSlot
                        visible: !entry.modelData.isSeparator && (entry.modelData.buttonType !== QsMenuButtonType.None || !!entry.modelData.icon)
                        anchors.left: parent.left
                        anchors.leftMargin: 10
                        width: 22
                        height: parent.height

                        Text {
                            visible: !entry.modelData.isSeparator && entry.modelData.buttonType !== QsMenuButtonType.None
                            anchors.centerIn: parent
                            text: entry.modelData.checkState === Qt.Checked ? "✓" : ""
                            color: Colors.foreground
                            font.family: "Iosevka Nerd Font"
                            font.pixelSize: 15
                        }

                        Image {
                            visible: !entry.modelData.isSeparator && entry.modelData.buttonType === QsMenuButtonType.None && !!entry.modelData.icon
                            anchors.centerIn: parent
                            source: entry.modelData.icon
                            width: 18
                            height: 18
                            fillMode: Image.PreserveAspectFit
                        }
                    }

                    Text {
                        anchors.left: leadingSlot.visible ? leadingSlot.right : parent.left
                        anchors.leftMargin: leadingSlot.visible ? 8 : 10
                        anchors.right: submenuArrow.left
                        anchors.rightMargin: 8
                        height: parent.height
                        verticalAlignment: Text.AlignVCenter
                        text: entry.modelData.text
                        elide: Text.ElideRight
                        color: entry.modelData.enabled ? Colors.foreground : Colors.muted
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: 16
                    }

                    Text {
                        id: submenuArrow
                        anchors.right: parent.right
                        anchors.rightMargin: 10
                        width: entry.modelData.hasChildren ? 16 : 0
                        height: parent.height
                        verticalAlignment: Text.AlignVCenter
                        text: entry.modelData.hasChildren ? "›" : ""
                        color: Colors.foreground
                        font.family: "Iosevka Nerd Font"
                        font.pixelSize: 19
                    }

                    MouseArea {
                        id: entryMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        enabled: !entry.modelData.isSeparator && entry.modelData.enabled
                        onClicked: {
                            if (entry.modelData.hasChildren) {
                                popup.history = popup.history.concat([popup.currentMenu]);
                                popup.currentMenu = entry.modelData;
                                menuScroll.contentY = 0;
                            } else {
                                entry.modelData.triggered();
                                popup.visible = false;
                            }
                        }
                    }
                }
            }

            Text {
                visible: entries.count === 0
                leftPadding: 10
                text: "No options"
                color: Colors.muted
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 16
            }
        }
    }
}
