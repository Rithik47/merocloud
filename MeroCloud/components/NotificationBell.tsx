"use client";

import { useState } from "react";
import { Bell, Copy, Share2, Info } from "lucide-react";
import {
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "@/lib/actions/notification.actions";

const TYPE_CONFIG: Record<
  string,
  { icon: React.ReactNode; bg: string; dot: string }
> = {
  duplicate: {
    icon: <Copy className="size-4" />,
    bg: "bg-orange/15 dark:bg-orange/10",
    dot: "bg-orange",
  },
  file_shared: {
    icon: <Share2 className="size-4" />,
    bg: "bg-blue/15 dark:bg-blue/10",
    dot: "bg-blue",
  },
  system: {
    icon: <Info className="size-4" />,
    bg: "bg-brand/15 dark:bg-brand/10",
    dot: "bg-brand",
  },
};

const timeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

interface Props {
  notifications: AppNotification[];
  userId: string;
}

const NotificationBell = ({ notifications: initial, userId }: Props) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(initial);
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.$id === id ? { ...n, isRead: true } : n)),
    );
    await markNotificationRead(id);
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsRead(userId);
  };

  return (
    <div className="relative">
      {/* Bell trigger */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative flex size-9 items-center justify-center rounded-full border border-light-400/60 bg-white/80 shadow-sm transition hover:bg-light-300 dark:border-white/10 dark:bg-dark-200 dark:hover:bg-dark-100"
      >
        <Bell className="size-[18px] text-light-100 dark:text-light-300" />

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-red text-[10px] font-bold leading-none text-white shadow">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-11 z-40 w-[340px] overflow-hidden rounded-2xl border border-light-400/50 bg-white shadow-drop-3 dark:border-white/10 dark:bg-dark-200">

          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-light-400/50 px-4 py-3 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-light-100 dark:text-light-300" />
              <p className="subtitle-2 text-light-100 dark:text-light-300">
                Notifications
              </p>
              {unreadCount > 0 && (
                <span className="flex h-5 items-center rounded-full bg-red px-1.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="caption text-brand transition hover:opacity-70"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <ul className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="flex flex-col items-center gap-2 px-4 py-10">
                <Bell className="size-8 text-light-200 opacity-40" />
                <p className="body-2 text-light-200">No notifications yet</p>
                <p className="caption text-light-200 opacity-70">
                  You&apos;ll see activity like duplicates and shared files here
                </p>
              </li>
            ) : (
              notifications.map((n) => {
                const config = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;

                return (
                  <li
                    key={n.$id}
                    onClick={() => !n.isRead && handleMarkRead(n.$id)}
                    className={`flex cursor-pointer gap-3 border-b border-light-400/30 px-4 py-3 transition last:border-0 hover:bg-light-300/40 dark:border-white/5 dark:hover:bg-dark-100/50 ${
                      !n.isRead
                        ? "bg-light-300/60 dark:bg-dark-100/40"
                        : "opacity-75"
                    }`}
                  >
                    {/* Type icon */}
                    <div
                      className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${config.bg} text-light-100 dark:text-light-300`}
                    >
                      {config.icon}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="subtitle-2 text-light-100 dark:text-light-300">
                          {n.title}
                        </p>
                        <span className="caption shrink-0 text-light-200">
                          {timeAgo(n.$createdAt)}
                        </span>
                      </div>

                      <p className="caption mt-0.5 line-clamp-2 text-light-200">
                        {n.message}
                      </p>

                      {/* Unread indicator */}
                      {!n.isRead && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className={`inline-block size-2 rounded-full ${config.dot}`}
                          />
                          <span className="caption text-light-200 opacity-70">
                            Unread
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
