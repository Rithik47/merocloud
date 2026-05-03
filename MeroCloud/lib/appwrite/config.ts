const getEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) return value;
  }

  throw new Error(`Missing required environment variable. Expected one of: ${keys.join(", ")}`);
};

const getOptionalEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) return value;
  }

  return undefined;
};

export const appwriteConfig = {
  endpointUrl: getEnv(["NEXT_PUBLIC_APPWRITE_ENDPOINT"]),
  projectId: getEnv([
    "NEXT_PUBLIC_APPWRITE_PROJECT",
    "NEXT_PUBLIC_APPWRITE_PROJECT_ID",
  ]),
  databaseId: getEnv([
    "NEXT_PUBLIC_APPWRITE_DATABASE",
    "NEXT_PUBLIC_APPWRITE_DATABASE_ID",
  ]),
  usersCollectionId: getEnv([
    "NEXT_PUBLIC_APPWRITE_USERS_COLLECTION",
    "NEXT_PUBLIC_APPWRITE_USERS_COLLECTION_ID",
  ]),
  filesCollectionId: getEnv([
    "NEXT_PUBLIC_APPWRITE_FILES_COLLECTION",
    "NEXT_PUBLIC_APPWRITE_FILES_COLLECTION_ID",
  ]),
  aiJobsCollectionId: getOptionalEnv([
    "NEXT_PUBLIC_APPWRITE_AI_JOBS_COLLECTION",
    "NEXT_PUBLIC_APPWRITE_AI_JOBS_COLLECTION_ID",
    "NEXT_PUBLIC_APPWRITE_FILESAIJOBS_COLLECTION",
  ]),
  notificationsCollectionId: getEnv([
    "NEXT_PUBLIC_APPWRITE_NOTIFICATIONS_COLLECTION",
  ]),
  bucketId: getEnv([
    "NEXT_PUBLIC_APPWRITE_BUCKET",
    "NEXT_PUBLIC_APPWRITE_BUCKET_ID",
  ]),
  secretKey: getEnv(["NEXT_APPWRITE_KEY"]),
};
