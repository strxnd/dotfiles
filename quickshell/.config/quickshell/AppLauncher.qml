pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Wayland
import "Colors.js" as Colors

PanelWindow {
    id: launcher
    property int selectedIndex: 0
    readonly property var matches: {
        const query = search.text.trim().toLowerCase();
        const apps = DesktopEntries.applications.values.slice().sort((a, b) => a.name.localeCompare(b.name));
        if (!query) return apps;
        return apps.filter(app => (app.name + " " + app.genericName + " " + app.keywords.join(" ")).toLowerCase().includes(query));
    }
    signal dismissed()

    function launch(index) {
        const app = matches[index];
        if (!app) return;
        dismissed();
        app.execute();
    }

    visible: false
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    color: "transparent"

    onVisibleChanged: {
        if (visible) {
            search.text = "";
            selectedIndex = 0;
            Qt.callLater(() => search.forceActiveFocus());
        }
    }

    MouseArea {
        anchors.fill: parent
        onClicked: launcher.dismissed()
    }

    Rectangle {
        id: card
        anchors.centerIn: parent
        width: Math.min(460, launcher.width - 32)
        height: 86 + 48 * Math.min(8, Math.max(1, launcher.matches.length), Math.max(1, Math.floor((launcher.height - 48 - 86) / 48)))
        color: Colors.background
        border.width: 2
        border.color: Colors.accent

        MouseArea { anchors.fill: parent }

        Item {
            id: inputBox
            anchors { top: parent.top; left: parent.left; right: parent.right; margins: 19 }
            height: 48

            TextInput {
                id: search
                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter }
                color: Colors.foreground
                selectionColor: Colors.accent
                selectedTextColor: Colors.background
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 19
                clip: true
                cursorDelegate: Item {}
                onTextChanged: {
                    launcher.selectedIndex = 0;
                    results.contentY = 0;
                }
                Keys.onEscapePressed: launcher.dismissed()
                Keys.onDownPressed: launcher.selectedIndex = Math.min(launcher.selectedIndex + 1, Math.max(0, launcher.matches.length - 1))
                Keys.onUpPressed: launcher.selectedIndex = Math.max(launcher.selectedIndex - 1, 0)
                Keys.onReturnPressed: launcher.launch(launcher.selectedIndex)
                Keys.onEnterPressed: launcher.launch(launcher.selectedIndex)

                Text {
                    anchors.fill: parent
                    visible: !search.text
                    text: "󰍉 Search..."
                    color: Colors.muted
                    font: search.font
                }
            }

            Rectangle {
                x: search.x + search.cursorRectangle.x
                y: search.y + search.cursorRectangle.y
                width: search.positionToRectangle(search.cursorPosition + 1).x - search.cursorRectangle.x
                height: search.cursorRectangle.height
                color: Colors.foreground
                visible: search.activeFocus && search.cursorPosition < search.length && width > 0

                Text {
                    anchors.centerIn: parent
                    text: search.text.charAt(search.cursorPosition)
                    color: Colors.background
                    font: search.font
                }
            }
        }

        ListView {
            id: results
            anchors { top: inputBox.bottom; bottom: parent.bottom; bottomMargin: 19; left: parent.left; leftMargin: 19; right: parent.right; rightMargin: 19 }
            clip: true
            model: launcher.matches
            spacing: 0
            currentIndex: launcher.selectedIndex
            highlightMoveDuration: 0
            onCurrentIndexChanged: {
                if (currentIndex >= 0) positionViewAtIndex(currentIndex, ListView.Contain);
            }

            delegate: Rectangle {
                id: row
                required property var modelData
                required property int index
                width: results.width
                height: 48
                color: index === launcher.selectedIndex || rowMouse.containsMouse ? Colors.hover : "transparent"

                Image {
                    id: icon
                    anchors { left: parent.left; leftMargin: 13; verticalCenter: parent.verticalCenter }
                    width: 24
                    height: 24
                    source: Quickshell.iconPath(row.modelData.icon || "application-x-executable", "application-x-executable")
                    fillMode: Image.PreserveAspectFit
                }

                Text {
                    anchors { left: icon.right; leftMargin: 12; right: parent.right; rightMargin: 13 }
                    height: parent.height
                    verticalAlignment: Text.AlignVCenter
                    text: row.modelData.name
                    color: row.index === launcher.selectedIndex ? Colors.foreground : Colors.foregroundDim
                    font.family: "Iosevka Nerd Font"
                    font.pixelSize: 19
                    elide: Text.ElideRight
                }

                MouseArea {
                    id: rowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onEntered: launcher.selectedIndex = row.index
                    onClicked: launcher.launch(row.index)
                }
            }

            Text {
                anchors.centerIn: parent
                visible: results.count === 0
                text: "No applications found"
                color: Colors.muted
                font.family: "Iosevka Nerd Font"
                font.pixelSize: 14
            }
        }

    }
}
