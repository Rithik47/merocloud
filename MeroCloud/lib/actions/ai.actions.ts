"use server";

import { ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { revalidatePath } from "next/cache";

import {
  getBackgroundRemovedImage,
  getImageWithTransformation,
} from "@/lib/ai/imagekit";
import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { constructFileUrl, getFileType, parseStringify } from "@/lib/utils";

const getAiJobsCollectionId = () => {
  const aiJobsCollectionId = appwriteConfig.aiJobsCollectionId;

  if (!aiJobsCollectionId) {
    throw new Error(
      "Missing AI jobs collection env var. Set NEXT_PUBLIC_APPWRITE_AI_JOBS_COLLECTION.",
    );
  }

  return aiJobsCollectionId;
};

const toBuffer = (data: unknown) => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer);

  throw new Error("Unsupported download payload returned by Appwrite storage.");
};

const getBaseName = (fileName: string) => {
  const parts = fileName.split(".");

  if (parts.length <= 1) return fileName;

  return parts.slice(0, -1).join(".");
};

const getOwnerId = (owner: unknown) => {
  if (typeof owner === "string") return owner;
  if (owner && typeof owner === "object" && "$id" in owner) {
    const ownerRecord = owner as { $id?: string };
    return ownerRecord.$id ?? "";
  }

  return "";
};

const IMAGE_PRESET_CONFIG = {
  crop_square: {
    label: "Crop 1:1",
    transformation: "w-1080,h-1080,c-force,q-80,f-png",
    width: 1080,
    height: 1080,
    quality: 80,
    format: "png",
    fileSuffix: "crop-square",
  },
  crop_portrait: {
    label: "Crop 4:5",
    transformation: "w-1080,h-1350,c-force,q-80,f-png",
    width: 1080,
    height: 1350,
    quality: 80,
    format: "png",
    fileSuffix: "crop-portrait",
  },
  crop_landscape: {
    label: "Crop 16:9",
    transformation: "w-1600,h-900,c-force,q-80,f-png",
    width: 1600,
    height: 900,
    quality: 80,
    format: "png",
    fileSuffix: "crop-landscape",
  },
  resize_web: {
    label: "Resize Web",
    transformation: "w-1600,c-at_max,q-75,f-png",
    width: 1600,
    quality: 75,
    format: "png",
    fileSuffix: "resize-web",
  },
  resize_mobile: {
    label: "Resize Mobile",
    transformation: "w-1080,c-at_max,q-70,f-png",
    width: 1080,
    quality: 70,
    format: "png",
    fileSuffix: "resize-mobile",
  },
  resize_hd: {
    label: "Resize HD",
    transformation: "w-1920,c-at_max,q-82,f-png",
    width: 1920,
    quality: 82,
    format: "png",
    fileSuffix: "resize-hd",
  },
} as const;

type ImagePresetKey = keyof typeof IMAGE_PRESET_CONFIG;

const getPresetConfig = (preset: string) => {
  if (!(preset in IMAGE_PRESET_CONFIG)) {
    throw new Error("Unsupported image preset.");
  }

  return IMAGE_PRESET_CONFIG[preset as ImagePresetKey];
};

const IMAGE_EDIT_CONFIG = {
  ...IMAGE_PRESET_CONFIG,
  remove_background: {
    label: "Remove Background",
    transformation: "e-bgremove,f-png",
    width: 1080,
    quality: 90,
    format: "png",
    fileSuffix: "bgremove",
  },
  filter_grayscale: {
    label: "Grayscale",
    transformation: "e-grayscale,q-80,f-png",
    width: 1080,
    quality: 80,
    format: "png",
    fileSuffix: "grayscale",
  },
  filter_contrast: {
    label: "Contrast",
    transformation: "e-contrast,q-80,f-png",
    width: 1080,
    quality: 80,
    format: "png",
    fileSuffix: "contrast",
  },
  filter_sharpen: {
    label: "Sharpen",
    transformation: "e-sharpen-10,q-80,f-png",
    width: 1080,
    quality: 80,
    format: "png",
    fileSuffix: "sharpen",
  },
  filter_blur: {
    label: "Blur",
    transformation: "bl-10,q-80,f-png",
    width: 1080,
    quality: 80,
    format: "png",
    fileSuffix: "blur",
  },
  rotate_left: {
    label: "Rotate Left",
    transformation: "rt-N90,q-85,f-png",
    width: 1080,
    quality: 85,
    format: "png",
    fileSuffix: "rotate-left",
  },
  rotate_right: {
    label: "Rotate Right",
    transformation: "rt-90,q-85,f-png",
    width: 1080,
    quality: 85,
    format: "png",
    fileSuffix: "rotate-right",
  },
  rotate_180: {
    label: "Rotate 180",
    transformation: "rt-180,q-85,f-png",
    width: 1080,
    quality: 85,
    format: "png",
    fileSuffix: "rotate-180",
  },
  flip_horizontal: {
    label: "Flip Horizontal",
    transformation: "fl-h,q-85,f-png",
    width: 1080,
    quality: 85,
    format: "png",
    fileSuffix: "flip-horizontal",
  },
  flip_vertical: {
    label: "Flip Vertical",
    transformation: "fl-v,q-85,f-png",
    width: 1080,
    quality: 85,
    format: "png",
    fileSuffix: "flip-vertical",
  },
  smart_crop_auto: {
    label: "Smart Crop (Auto)",
    transformation: "w-1080,h-1350,c-maintain_ratio,fo-auto,q-85,f-png",
    width: 1080,
    height: 1350,
    quality: 85,
    format: "png",
    fileSuffix: "smart-crop-auto",
  },
  smart_crop_face: {
    label: "Face Crop",
    transformation: "w-1080,h-1080,c-maintain_ratio,fo-face,q-85,f-png",
    width: 1080,
    height: 1080,
    quality: 85,
    format: "png",
    fileSuffix: "smart-crop-face",
  },
  smart_crop_person: {
    label: "Object Crop (Person)",
    transformation: "w-1080,h-1350,c-maintain_ratio,fo-person,q-85,f-png",
    width: 1080,
    height: 1350,
    quality: 85,
    format: "png",
    fileSuffix: "smart-crop-person",
  },
  smart_crop_car: {
    label: "Object Crop (Car)",
    transformation: "w-1600,h-900,c-maintain_ratio,fo-car,q-85,f-png",
    width: 1600,
    height: 900,
    quality: 85,
    format: "png",
    fileSuffix: "smart-crop-car",
  },
  auto_enhance: {
    label: "Auto Enhance",
    transformation: "e-retouch,e-contrast,e-sharpen-8,q-88,f-png",
    width: 1080,
    quality: 88,
    format: "png",
    fileSuffix: "auto-enhance",
  },
  ai_upscale: {
    label: "AI Upscale",
    transformation: "e-upscale,f-png",
    width: 2500,
    quality: 90,
    format: "png",
    fileSuffix: "ai-upscale",
  },
} as const;

type ImageEditKey = keyof typeof IMAGE_EDIT_CONFIG;

const getEditConfig = (editKey: string) => {
  if (!(editKey in IMAGE_EDIT_CONFIG)) {
    throw new Error("Unsupported image edit action.");
  }

  return IMAGE_EDIT_CONFIG[editKey as ImageEditKey];
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object" && "message" in error) {
    const appwriteError = error as { message?: unknown };

    if (typeof appwriteError.message === "string") {
      return appwriteError.message;
    }
  }

  return "";
};

const extractUnknownAttribute = (error: unknown) => {
  const message = getErrorMessage(error);
  const match = message.match(/unknown attribute\s*:?\s*"?([a-zA-Z0-9_]+)"?/i);

  return match?.[1] ?? null;
};

const removeAttributeCaseInsensitive = (
  payload: Record<string, string | number>,
  attributeName: string,
) => {
  const nextPayload: Record<string, string | number> = { ...payload };
  const payloadKey = Object.keys(nextPayload).find(
    (key) => key.toLowerCase() === attributeName.toLowerCase(),
  );

  if (!payloadKey) {
    return null;
  }

  delete nextPayload[payloadKey];

  return nextPayload;
};

const createAiJob = async ({
  fileId,
  userId,
  type,
  prompt,
  input,
  version,
}: {
  fileId: string;
  userId: string;
  type?: string;
  prompt?: string;
  input?: string;
  version: number;
}) => {
  const { databases } = await createAdminClient();

  let payload: Record<string, string | number> = {
    fileId,
    userId,
    type: type || "image-edit",
    status: "queued",
    provider: "imagekit",
    prompt: prompt || "Remove image background",
    input: input || "",
    output: "",
    sourceFileId: fileId,
    editedFileId: "",
    editedFileUrl: "",
    aiResultText: "",
    aiMetadata: "",
    processingError: "",
    version,
  };

  while (true) {
    try {
      return await databases.createDocument(
        appwriteConfig.databaseId,
        getAiJobsCollectionId(),
        ID.unique(),
        payload,
      );
    } catch (error) {
      const unknownAttribute = extractUnknownAttribute(error);

      if (!unknownAttribute) {
        throw error;
      }

      const sanitizedPayload = removeAttributeCaseInsensitive(
        payload,
        unknownAttribute,
      );

      if (!sanitizedPayload) {
        throw error;
      }

      payload = sanitizedPayload;
    }
  }
};

const updateAiJob = async (
  jobId: string,
  payload: Record<string, string | number>,
) => {
  const { databases } = await createAdminClient();

  let mutablePayload = { ...payload };

  while (true) {
    try {
      return await databases.updateDocument(
        appwriteConfig.databaseId,
        getAiJobsCollectionId(),
        jobId,
        mutablePayload,
      );
    } catch (error) {
      const unknownAttribute = extractUnknownAttribute(error);

      if (!unknownAttribute) {
        throw error;
      }

      const sanitizedPayload = removeAttributeCaseInsensitive(
        mutablePayload,
        unknownAttribute,
      );

      if (!sanitizedPayload) {
        throw error;
      }

      mutablePayload = sanitizedPayload;
    }
  }
};

const getNextVersion = async (sourceFileId: string) => {
  const { databases } = await createAdminClient();

  const previousJobs = await databases.listDocuments(
    appwriteConfig.databaseId,
    getAiJobsCollectionId(),
    [Query.equal("sourceFileId", [sourceFileId])],
  );

  return previousJobs.total + 1;
};

export const removeImageBackground = async ({
  fileId,
  path,
  prompt,
}: RemoveImageBackgroundProps) => {
  const { databases, storage } = await createAdminClient();

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new Error("User not authenticated.");
  }

  const sourceFile = await databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    fileId,
  );

  const fileType = getFileType(sourceFile.name).type;

  if (fileType !== "image") {
    throw new Error("Background removal currently supports only image files.");
  }

  const isOwner =
    sourceFile.accountId === currentUser.accountId ||
    getOwnerId(sourceFile.owner) === currentUser.$id;

  if (!isOwner) {
    throw new Error("Only the file owner can run AI image edits.");
  }

  const version = await getNextVersion(fileId);
  const job = await createAiJob({
    fileId,
    userId: currentUser.$id,
    type: "image-edit",
    prompt,
    input: JSON.stringify({ operation: "background-removal" }),
    version,
  });

  try {
    await updateAiJob(job.$id, { status: "processing" });

    const sourceDownload = await storage.getFileDownload(
      appwriteConfig.bucketId,
      sourceFile.bucketFileId,
    );

    const sourceBuffer = toBuffer(sourceDownload);

    const { transformedBuffer, transformedUrl, sourceImageKitFileId } =
      await getBackgroundRemovedImage({
        sourceBuffer,
        sourceFileName: sourceFile.name,
        folder: `/merocloud/ai/${currentUser.$id}`,
      });

    const derivedFileName = `${getBaseName(sourceFile.name)}-bgremove-v${version}.png`;
    const appwriteInputFile = InputFile.fromBuffer(transformedBuffer, derivedFileName);

    const uploadedDerivedFile = await storage.createFile(
      appwriteConfig.bucketId,
      ID.unique(),
      appwriteInputFile,
    );

    const derivedDocument = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      ID.unique(),
      {
        type: "image",
        name: derivedFileName,
        url: constructFileUrl(uploadedDerivedFile.$id),
        extension: "png",
        size: uploadedDerivedFile.sizeOriginal,
        owner: currentUser.$id,
        accountId: currentUser.accountId,
        users: [],
        bucketFileId: uploadedDerivedFile.$id,
      },
    );

    const updatedJob = await updateAiJob(job.$id, {
      status: "complete",
      output: JSON.stringify({
        sourceImageKitFileId,
        transformedUrl,
        derivedFileId: derivedDocument.$id,
      }),
      editedFileId: derivedDocument.$id,
      editedFileUrl: derivedDocument.url,
      aiResultText: "Background removed successfully.",
      aiMetadata: JSON.stringify({
        operation: "e-bgremove",
        fileName: derivedFileName,
        provider: "imagekit",
      }),
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({
      status: "success",
      file: derivedDocument,
      job: updatedJob,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process image background removal.";

    await updateAiJob(job.$id, {
      status: "failed",
      processingError: message,
    });

    throw error;
  }
};

export const transformImageWithPreset = async ({
  fileId,
  path,
  preset,
}: {
  fileId: string;
  path: string;
  preset: string;
}) => {
  const { databases, storage } = await createAdminClient();

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new Error("User not authenticated.");
  }

  const sourceFile = await databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    fileId,
  );

  const fileType = getFileType(sourceFile.name).type;

  if (fileType !== "image") {
    throw new Error("Crop and resize presets support image files only.");
  }

  const isOwner =
    sourceFile.accountId === currentUser.accountId ||
    getOwnerId(sourceFile.owner) === currentUser.$id;

  if (!isOwner) {
    throw new Error("Only the file owner can run AI image presets.");
  }

  const presetConfig = getPresetConfig(preset);
  const presetHeight =
    "height" in presetConfig ? presetConfig.height : undefined;
  const version = await getNextVersion(fileId);

  const job = await createAiJob({
    fileId,
    userId: currentUser.$id,
    type: "image-transform",
    prompt: `Apply preset ${presetConfig.label}`,
    input: JSON.stringify({
      operation: "image-transform",
      preset,
      transformation: presetConfig.transformation,
      width: presetConfig.width,
      height: presetHeight,
      quality: presetConfig.quality,
      format: presetConfig.format,
    }),
    version,
  });

  try {
    await updateAiJob(job.$id, { status: "processing" });

    const sourceDownload = await storage.getFileDownload(
      appwriteConfig.bucketId,
      sourceFile.bucketFileId,
    );

    const sourceBuffer = toBuffer(sourceDownload);

    const { transformedBuffer, transformedUrl, sourceImageKitFileId } =
      await getImageWithTransformation({
        sourceBuffer,
        sourceFileName: sourceFile.name,
        transformation: presetConfig.transformation,
        folder: `/merocloud/ai/${currentUser.$id}`,
      });

    const derivedFileName = `${getBaseName(sourceFile.name)}-${presetConfig.fileSuffix}-v${version}.${presetConfig.format}`;
    const appwriteInputFile = InputFile.fromBuffer(transformedBuffer, derivedFileName);

    const uploadedDerivedFile = await storage.createFile(
      appwriteConfig.bucketId,
      ID.unique(),
      appwriteInputFile,
    );

    const derivedDocument = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      ID.unique(),
      {
        type: "image",
        name: derivedFileName,
        url: constructFileUrl(uploadedDerivedFile.$id),
        extension: presetConfig.format,
        size: uploadedDerivedFile.sizeOriginal,
        owner: currentUser.$id,
        accountId: currentUser.accountId,
        users: [],
        bucketFileId: uploadedDerivedFile.$id,
      },
    );

    const updatedJob = await updateAiJob(job.$id, {
      status: "complete",
      output: JSON.stringify({
        sourceImageKitFileId,
        transformedUrl,
        derivedFileId: derivedDocument.$id,
        preset,
      }),
      editedFileId: derivedDocument.$id,
      editedFileUrl: derivedDocument.url,
      aiResultText: `${presetConfig.label} applied successfully.`,
      aiMetadata: JSON.stringify({
        operation: "image-transform",
        preset,
        transformation: presetConfig.transformation,
        provider: "imagekit",
        fileName: derivedFileName,
      }),
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({
      status: "success",
      file: derivedDocument,
      job: updatedJob,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process image preset transform.";

    await updateAiJob(job.$id, {
      status: "failed",
      processingError: message,
    });

    throw error;
  }
};

export const transformImageWithAction = async ({
  fileId,
  path,
  actionKey,
}: {
  fileId: string;
  path: string;
  actionKey: string;
}) => {
  const { databases, storage } = await createAdminClient();

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new Error("User not authenticated.");
  }

  const sourceFile = await databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    fileId,
  );

  const fileType = getFileType(sourceFile.name).type;

  if (fileType !== "image") {
    throw new Error("Image editing tools support image files only.");
  }

  const isOwner =
    sourceFile.accountId === currentUser.accountId ||
    getOwnerId(sourceFile.owner) === currentUser.$id;

  if (!isOwner) {
    throw new Error("Only the file owner can run AI image edits.");
  }

  const editConfig = getEditConfig(actionKey);
  const presetHeight = "height" in editConfig ? editConfig.height : undefined;
  const version = await getNextVersion(fileId);

  const job = await createAiJob({
    fileId,
    userId: currentUser.$id,
    type: "image-transform",
    prompt: `Apply edit ${editConfig.label}`,
    input: JSON.stringify({
      operation: "image-transform",
      actionKey,
      transformation: editConfig.transformation,
      width: editConfig.width,
      height: presetHeight,
      quality: editConfig.quality,
      format: editConfig.format,
    }),
    version,
  });

  try {
    await updateAiJob(job.$id, { status: "processing" });

    const sourceDownload = await storage.getFileDownload(
      appwriteConfig.bucketId,
      sourceFile.bucketFileId,
    );

    const sourceBuffer = toBuffer(sourceDownload);

    const { transformedBuffer, transformedUrl, sourceImageKitFileId } =
      await getImageWithTransformation({
        sourceBuffer,
        sourceFileName: sourceFile.name,
        transformation: editConfig.transformation,
        folder: `/merocloud/ai/${currentUser.$id}`,
      });

    const derivedFileName = `${getBaseName(sourceFile.name)}-${editConfig.fileSuffix}-v${version}.${editConfig.format}`;
    const appwriteInputFile = InputFile.fromBuffer(transformedBuffer, derivedFileName);

    const uploadedDerivedFile = await storage.createFile(
      appwriteConfig.bucketId,
      ID.unique(),
      appwriteInputFile,
    );

    const derivedDocument = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      ID.unique(),
      {
        type: "image",
        name: derivedFileName,
        url: constructFileUrl(uploadedDerivedFile.$id),
        extension: editConfig.format,
        size: uploadedDerivedFile.sizeOriginal,
        owner: currentUser.$id,
        accountId: currentUser.accountId,
        users: [],
        bucketFileId: uploadedDerivedFile.$id,
      },
    );

    const updatedJob = await updateAiJob(job.$id, {
      status: "complete",
      output: JSON.stringify({
        sourceImageKitFileId,
        transformedUrl,
        derivedFileId: derivedDocument.$id,
        actionKey,
      }),
      editedFileId: derivedDocument.$id,
      editedFileUrl: derivedDocument.url,
      aiResultText: `${editConfig.label} applied successfully.`,
      aiMetadata: JSON.stringify({
        operation: "image-transform",
        actionKey,
        transformation: editConfig.transformation,
        provider: "imagekit",
        fileName: derivedFileName,
      }),
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({
      status: "success",
      file: derivedDocument,
      job: updatedJob,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process image edit action.";

    await updateAiJob(job.$id, {
      status: "failed",
      processingError: message,
    });

    throw error;
  }
};

export const generateImageActionPreview = async ({
  fileId,
  actionKey,
}: {
  fileId: string;
  actionKey: string;
}) => {
  const { databases, storage } = await createAdminClient();

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new Error("User not authenticated.");
  }

  const sourceFile = await databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    fileId,
  );

  const fileType = getFileType(sourceFile.name).type;

  if (fileType !== "image") {
    throw new Error("Image editing tools support image files only.");
  }

  const isOwner =
    sourceFile.accountId === currentUser.accountId ||
    getOwnerId(sourceFile.owner) === currentUser.$id;

  if (!isOwner) {
    throw new Error("Only the file owner can run AI image edits.");
  }

  const editConfig = getEditConfig(actionKey);

  const sourceDownload = await storage.getFileDownload(
    appwriteConfig.bucketId,
    sourceFile.bucketFileId,
  );

  const sourceBuffer = toBuffer(sourceDownload);

  const { transformedUrl } = await getImageWithTransformation({
    sourceBuffer,
    sourceFileName: sourceFile.name,
    transformation: editConfig.transformation,
    folder: `/merocloud/ai/${currentUser.$id}`,
  });

  return parseStringify({
    status: "success",
    previewUrl: transformedUrl,
    actionKey,
    actionLabel: editConfig.label,
  });
};
