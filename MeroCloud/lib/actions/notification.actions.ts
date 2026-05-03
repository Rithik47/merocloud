"use server";

import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { ID, Models, Query } from "node-appwrite";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { parseStringify } from "@/lib/utils";

export type NotificationType = "duplicate" | "file_shared" | "system";

export interface AppNotification extends Models.Document {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  fileId: string;
  fileName: string;
  isRead: boolean;
}

// Creates a notification — never throws, so it never blocks the caller
export const createNotification = async ({
  userId,
  type,
  title,
  message,
  fileId = "",
  fileName = "",
}: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  fileId?: string;
  fileName?: string;
}) => {
  const { databases } = await createAdminClient();

  try {
    await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.notificationsCollectionId,
      ID.unique(),
      { userId, type, title, message, fileId, fileName, isRead: false },
    );
  } catch (error) {
    console.log("Failed to create notification:", error);
  }
};

export const getNotifications = async (): Promise<AppNotification[]> => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) return [];

    const result = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.notificationsCollectionId,
      [
        Query.equal("userId", [currentUser.$id]),
        Query.orderDesc("$createdAt"),
        Query.limit(20),
      ],
    );

    return parseStringify(result.documents) as AppNotification[];
  } catch (error) {
    console.log("Failed to get notifications:", error);
    return [];
  }
};

export const markNotificationRead = async (
  notificationId: string,
): Promise<void> => {
  const { databases } = await createAdminClient();

  try {
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.notificationsCollectionId,
      notificationId,
      { isRead: true },
    );
  } catch (error) {
    console.log("Failed to mark notification as read:", error);
  }
};

export const markAllNotificationsRead = async (
  userId: string,
): Promise<void> => {
  const { databases } = await createAdminClient();

  try {
    const unread = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.notificationsCollectionId,
      [
        Query.equal("userId", [userId]),
        Query.equal("isRead", [false]),
        Query.limit(50),
      ],
    );

    await Promise.all(
      unread.documents.map((doc) =>
        databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.notificationsCollectionId,
          doc.$id,
          { isRead: true },
        ),
      ),
    );
  } catch (error) {
    console.log("Failed to mark all notifications as read:", error);
  }
};
