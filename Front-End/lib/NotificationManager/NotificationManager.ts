/**
 * Notification manager
 */
export class NotificationManager {
  /**
   * Desktop notification
   * @returns
   */
  static desktop() {
    return DesktopNotification;
  }
}

class DesktopNotification {
  /**
   * Request notification permission
   * @returns
   */
  static notifyPermission() {
    if (!Notification) {
      alert(
        "Desktop notifications not available in your browser. Try Chromium."
      );
      return;
    }

    if (Notification.permission !== "granted") Notification.requestPermission();
  }
  /**
   * Send notification
   * @param param0
   */
  static notify({
    title,
    body,
    icon = "http://cdn.sstatic.net/stackexchange/img/logos/so/so-icon.png",
  }: {
    title: string;
    body: string;
    icon?: string;
  }) {
    if (Notification.permission !== "granted") Notification.requestPermission();
    else {
      const notification = new Notification(title, {
        icon: icon,
        body: body,
      });

      // notification.onclick = function () {
      //     window.open('http://stackoverflow.com/a/13328397/1269037');
      // };
      return notification;
    }
  }
}
