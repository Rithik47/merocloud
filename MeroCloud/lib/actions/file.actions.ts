"use server";

import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { InputFile } from "node-appwrite/file";
import { appwriteConfig } from "@/lib/appwrite/config";
import { ID, Models, Query } from "node-appwrite";
import { constructFileUrl, getFileType, parseStringify } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { createNotification } from "@/lib/actions/notification.actions";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

const isNotFoundError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;

  const appwriteError = error as { code?: number; type?: string };

  return (
    appwriteError.code === 404 || appwriteError.type === "document_not_found"
  );
};

// Formats recompressed in their original format
const COMPRESSIBLE_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif"];

// Formats converted to a web-friendly format (key → output format)
// Output filename extension is changed accordingly
const CONVERT_IMAGE_EXTENSIONS: Record<string, "webp" | "jpeg"> = {
  tiff: "webp",
  tif: "webp",
  bmp: "webp",
  heic: "jpeg",
  heif: "jpeg",
};

const ALL_PROCESSABLE_IMAGE_EXTENSIONS = [
  ...COMPRESSIBLE_IMAGE_EXTENSIONS,
  ...Object.keys(CONVERT_IMAGE_EXTENSIONS),
];

const IMAGE_MAX_DIMENSION = 2560;
const VIDEO_MAX_DIMENSION = 1280;
const VIDEO_MAX_BITRATE = "1800k";
const AUDIO_BITRATE = "128k";
const BROWSER_PLAYABLE_VIDEO_EXTENSIONS = ["mp4", "webm", "ogg"];

const getFileExtension = (fileName: string) =>
  String(fileName.split(".").pop() || "").toLowerCase();

const getBaseFileName = (fileName: string) => {
  const parts = fileName.split(".");

  if (parts.length <= 1) return fileName;

  return parts.slice(0, -1).join(".");
};

const prepareUploadBuffer = async (file: File) => {
  const extension = getFileExtension(file.name);
  const fileType = getFileType(file.name).type;
  const originalBuffer = Buffer.from(await file.arrayBuffer());

  const shouldProcess =
    fileType === "image" && ALL_PROCESSABLE_IMAGE_EXTENSIONS.includes(extension);

  if (!shouldProcess) {
    return { fileName: file.name, buffer: originalBuffer };
  }

  try {
    const sharp = (await import("sharp")).default;

    // Output format after any conversion (e.g. tiff → webp, heic → jpeg).
    // Cast to include undefined — Record index signatures don't add it by default.
    const convertedFormat: "webp" | "jpeg" | null =
      (CONVERT_IMAGE_EXTENSIONS as Record<string, "webp" | "jpeg" | undefined>)[extension] ?? null;
    // Effective extension used to pick the Sharp encoder
    const outputExt: string = convertedFormat ?? extension;
    // Update filename when the format changes
    const outputFileName = convertedFormat
      ? `${getBaseFileName(file.name)}.${convertedFormat === "jpeg" ? "jpg" : convertedFormat}`
      : file.name;

    // .rotate() auto-orients from EXIF then discards the orientation tag.
    // Not calling .withMetadata() means Sharp strips ALL EXIF by default —
    // GPS, camera model, timestamps, etc. are removed from every processed file.
    const pipeline = sharp(originalBuffer, { failOnError: false })
      .rotate()
      .resize({
        width: IMAGE_MAX_DIMENSION,
        height: IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });

    let compressedBuffer: Buffer;

    if (outputExt === "png") {
      compressedBuffer = await pipeline
        .png({ compressionLevel: 9, palette: true, quality: 80 })
        .toBuffer();
    } else if (outputExt === "webp" || convertedFormat === "webp") {
      // Also handles tiff/tif/bmp → webp (80-98% size reduction)
      compressedBuffer = await pipeline.webp({ quality: 78 }).toBuffer();
    } else if (outputExt === "avif") {
      // effort 4 = balanced speed vs compression (0 fastest, 9 smallest)
      compressedBuffer = await pipeline.avif({ quality: 55, effort: 4 }).toBuffer();
    } else {
      // jpg / jpeg / heic → jpeg / heif → jpeg
      compressedBuffer = await pipeline
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
    }

    // Always return the Sharp-processed buffer so EXIF is always stripped.
    // For format conversions (tiff/bmp/heic), the size reduction is so large
    // that falling back to original would defeat the purpose.
    return { fileName: outputFileName, buffer: compressedBuffer };
  } catch (error) {
    console.log("Image processing skipped", error);
    return { fileName: file.name, buffer: originalBuffer };
  }
};

// ZIP-based Office/document formats whose internal structure can be safely recompressed
const ZIP_DOCUMENT_EXTENSIONS = ["docx", "xlsx", "pptx", "ods", "odp", "odt", "epub"];
// Image formats that may appear as embedded assets inside those ZIP documents
const EMBEDDED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

const prepareDocumentBuffer = async (
  file: File,
): Promise<{ fileName: string; buffer: Buffer } | null> => {
  const extension = getFileExtension(file.name);
  const fileType = getFileType(file.name).type;

  if (fileType !== "document") return null;

  const originalBuffer = Buffer.from(await file.arrayBuffer());

  // --- PDF: re-save with object streams (lossless, 5-20% smaller) ---
  if (extension === "pdf") {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(originalBuffer, {
        ignoreEncryption: true,
      });
      const compressedBytes = await pdfDoc.save({ useObjectStreams: true });
      const compressedBuffer = Buffer.from(compressedBytes);

      if (compressedBuffer.length >= originalBuffer.length * 0.98) {
        return { fileName: file.name, buffer: originalBuffer };
      }

      return { fileName: file.name, buffer: compressedBuffer };
    } catch (error) {
      console.log("PDF compression skipped", error);
      return { fileName: file.name, buffer: originalBuffer };
    }
  }

  // --- ZIP-based formats (docx, xlsx, pptx, ods, odp, epub …) ---
  // Strategy: compress embedded images with Sharp, then recompress the ZIP
  // at maximum deflate level. Gains range from 5% (text-only) to 60%
  // (documents with large unoptimized images).
  if (ZIP_DOCUMENT_EXTENSIONS.includes(extension)) {
    try {
      const JSZip = (await import("jszip")).default;
      const sharp = (await import("sharp")).default;
      const zip = await JSZip.loadAsync(originalBuffer);

      // Compress each embedded image in parallel
      const tasks: Promise<void>[] = [];

      zip.forEach((relativePath, entry) => {
        const entryExt = (relativePath.split(".").pop() ?? "").toLowerCase();
        if (!EMBEDDED_IMAGE_EXTENSIONS.includes(entryExt)) return;

        tasks.push(
          entry.async("nodebuffer").then(async (imageBuffer) => {
            try {
              let compressed: Buffer;

              if (entryExt === "png") {
                compressed = await sharp(imageBuffer, { failOnError: false })
                  .png({ compressionLevel: 9, quality: 80 })
                  .toBuffer();
              } else if (entryExt === "webp") {
                compressed = await sharp(imageBuffer, { failOnError: false })
                  .webp({ quality: 78 })
                  .toBuffer();
              } else {
                compressed = await sharp(imageBuffer, { failOnError: false })
                  .jpeg({ quality: 78, mozjpeg: true })
                  .toBuffer();
              }

              // Only swap if meaningfully smaller
              if (compressed.length < imageBuffer.length * 0.98) {
                zip.file(relativePath, compressed);
              }
            } catch {
              // Leave original image intact if Sharp fails on this entry
            }
          }),
        );
      });

      await Promise.all(tasks);

      // Recompress the ZIP container at maximum deflate level
      const compressedBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
      });

      if (compressedBuffer.length >= originalBuffer.length * 0.98) {
        return { fileName: file.name, buffer: originalBuffer };
      }

      return { fileName: file.name, buffer: compressedBuffer };
    } catch (error) {
      console.log("Document ZIP compression skipped", error);
      return { fileName: file.name, buffer: originalBuffer };
    }
  }

  // All other document types (csv, txt, md, html, psd, ai …) — return unchanged
  return { fileName: file.name, buffer: originalBuffer };
};

const prepareVideoBuffer = async (file: File) => {
  const extension = getFileExtension(file.name);
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const isOriginalPlayable = BROWSER_PLAYABLE_VIDEO_EXTENSIONS.includes(extension);

  if (getFileType(file.name).type !== "video") {
    return null;
  }

  const ffmpegPath = (await import("ffmpeg-static")).default;

  if (!ffmpegPath) {
    throw new Error("FFmpeg is not available for video conversion.");
  }

  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), "merocloud-"));
  const inputFilePath = path.join(workingDirectory, `input.${extension}`);
  const outputFilePath = path.join(workingDirectory, "output.mp4");
  const outputFileName = `${getBaseFileName(file.name)}.mp4`;

  try {
    await writeFile(inputFilePath, originalBuffer);

    const ffmpegArgs = [
      "-y",
      "-i",
      inputFilePath,
      "-vf",
      `scale='min(${VIDEO_MAX_DIMENSION},iw)':-2`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "30",
      "-b:v",
      VIDEO_MAX_BITRATE,
      "-maxrate",
      VIDEO_MAX_BITRATE,
      "-bufsize",
      "3600k",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      AUDIO_BITRATE,
      "-movflags",
      "+faststart",
      outputFilePath,
    ];

    await execFileAsync(ffmpegPath, ffmpegArgs, { windowsHide: true });

    const compressedBuffer = await readFile(outputFilePath);

    if (isOriginalPlayable && compressedBuffer.length >= originalBuffer.length) {
      return {
        fileName: file.name,
        buffer: originalBuffer,
        usedOriginalAfterVideoFallback: false,
      };
    }

    return {
      fileName: outputFileName,
      buffer: compressedBuffer,
      usedOriginalAfterVideoFallback: false,
    };
  } catch (error) {
    console.log("Video conversion failed", error);

    // If the uploaded file is already browser-playable, keep original upload
    // rather than failing the whole request when transcoding fails.
    if (isOriginalPlayable) {
      return {
        fileName: file.name,
        buffer: originalBuffer,
        usedOriginalAfterVideoFallback: true,
      };
    }

    throw new Error(`Unable to convert ${file.name} to a browser-playable video.`);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
};

const computeContentHash = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");

// Max characters stored in Appwrite — stay under the 1 MB attribute limit
const MAX_EXTRACTED_TEXT_LENGTH = 900_000;

// Extensions we can meaningfully extract readable text from
const TEXT_EXTRACTABLE_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "xlsx",
  "txt",
  "csv",
  "md",
  "html",
  "htm",
]);

const extractTextFromFile = async (
  buffer: Buffer,
  extension: string,
): Promise<string> => {
  try {
    // --- PDF ---
    if (extension === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      return data.text.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    }

    // --- DOCX ---
    if (extension === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    }

    // --- XLSX ---
    if (extension === "xlsx") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const text = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_txt(sheet);
      }).join("\n");
      return text.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    }

    // --- Plain text formats (txt, csv, md, html, htm) ---
    if (["txt", "csv", "md", "html", "htm"].includes(extension)) {
      return buffer.toString("utf-8").slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    }
  } catch (error) {
    // Extraction failure must never block the upload
    console.log(`Text extraction skipped for .${extension}:`, error);
  }

  return "";
};

export const uploadFile = async ({
  file,
  ownerId,
  accountId,
  path,
  encryption,
}: UploadFileProps) => {
  const { storage, databases } = await createAdminClient();

  try {
    // ── Encrypted path: skip all server-side processing ──────────────────────
    if (encryption?.isEncrypted) {
      const rawBuffer = Buffer.from(await file.arrayBuffer());
      const inputFile = InputFile.fromBuffer(rawBuffer, file.name);

      const bucketFile = await storage.createFile(
        appwriteConfig.bucketId,
        ID.unique(),
        inputFile,
      );

      const fileDocument = {
        type: getFileType(file.name).type,
        name: file.name,
        url: constructFileUrl(bucketFile.$id),
        extension: getFileType(file.name).extension,
        size: bucketFile.sizeOriginal,
        owner: ownerId,
        accountId,
        users: [],
        bucketFileId: bucketFile.$id,
        extractedText: "",
        contentHash: "",
        isEncrypted: true,
        encryptedFileKey: encryption.encryptedFileKey,
        iv: encryption.iv,
      };

      const newFile = await databases
        .createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.filesCollectionId,
          ID.unique(),
          fileDocument,
        )
        .catch(async (error: unknown) => {
          await storage.deleteFile(appwriteConfig.bucketId, bucketFile.$id);
          handleError(error, "Failed to create encrypted file document");
        });

      revalidatePath(path);
      return parseStringify({
        file: newFile,
        meta: { usedOriginalAfterVideoFallback: false, isDuplicate: false },
      });
    }

    // ── Normal path: compression, text extraction, deduplication ─────────────
    const extension = getFileExtension(file.name);
    const shouldExtractText = TEXT_EXTRACTABLE_EXTENSIONS.has(extension);

    // Run text extraction and file preparation in parallel — independent of each other
    const [extractedText, preparedVideo] = await Promise.all([
      shouldExtractText
        ? extractTextFromFile(Buffer.from(await file.arrayBuffer()), extension)
        : Promise.resolve(""),
      prepareVideoBuffer(file),
    ]);

    const preparedDocument = preparedVideo ? null : await prepareDocumentBuffer(file);
    const preparedFile = preparedVideo ?? preparedDocument ?? (await prepareUploadBuffer(file));
    const usedOriginalAfterVideoFallback =
      preparedVideo?.usedOriginalAfterVideoFallback ?? false;

    // Hash the processed buffer to detect duplicates within this owner's files
    const contentHash = computeContentHash(preparedFile.buffer);

    // Wrapped in its own try-catch — a missing Appwrite index or any query
    // failure must never crash the upload. Deduplication is best-effort.
    let existingFiles: { total: number; documents: Models.Document[] } = {
      total: 0,
      documents: [],
    };
    try {
      existingFiles = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        [
          Query.equal("contentHash", [contentHash]),
          Query.equal("owner", [ownerId]),
          Query.limit(1),
        ],
      );
    } catch (error) {
      console.log("Duplicate check skipped:", error);
    }

    // --- Duplicate detected: reuse the existing storage object ---
    if (existingFiles.total > 0) {
      const original = existingFiles.documents[0];

      const duplicateDocument = {
        type: getFileType(preparedFile.fileName).type,
        name: preparedFile.fileName,
        url: original.url,
        extension: getFileType(preparedFile.fileName).extension,
        size: original.size,
        owner: ownerId,
        accountId,
        users: [],
        bucketFileId: original.bucketFileId,
        extractedText,
        contentHash,
      };

      const newFile = await databases.createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        ID.unique(),
        duplicateDocument,
      );

      await createNotification({
        userId: ownerId,
        type: "duplicate",
        title: "Duplicate file detected",
        message: `"${preparedFile.fileName}" is identical to "${original.name}" already in your storage. No extra space was used.`,
        fileId: newFile.$id,
        fileName: preparedFile.fileName,
      });

      revalidatePath(path);
      return parseStringify({
        file: newFile,
        meta: {
          usedOriginalAfterVideoFallback: false,
          isDuplicate: true,
          originalFileName: original.name,
        },
      });
    }

    // --- Unique file: upload to storage as normal ---
    const inputFile = InputFile.fromBuffer(
      preparedFile.buffer,
      preparedFile.fileName,
    );

    const bucketFile = await storage.createFile(
      appwriteConfig.bucketId,
      ID.unique(),
      inputFile,
    );

    const fileDocument = {
      type: getFileType(bucketFile.name).type,
      name: bucketFile.name,
      url: constructFileUrl(bucketFile.$id),
      extension: getFileType(bucketFile.name).extension,
      size: bucketFile.sizeOriginal,
      owner: ownerId,
      accountId,
      users: [],
      bucketFileId: bucketFile.$id,
      extractedText,
      contentHash,
    };

    const newFile = await databases
      .createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        ID.unique(),
        fileDocument,
      )
      .catch(async (error: unknown) => {
        await storage.deleteFile(appwriteConfig.bucketId, bucketFile.$id);
        handleError(error, "Failed to create file document");
      });

    revalidatePath(path);
    return parseStringify({
      file: newFile,
      meta: {
        usedOriginalAfterVideoFallback,
        isDuplicate: false,
      },
    });
  } catch (error) {
    handleError(error, "Failed to upload file");
  }
};

const createQueries = (
  currentUser: Models.Document,
  types: string[],
  searchText: string,
  sort: string,
  limit?: number,
) => {
  const queries = [
    Query.or([
      Query.equal("owner", [currentUser.$id]),
      Query.contains("users", [currentUser.email]),
    ]),
    Query.or([Query.equal("isDeleted", false), Query.isNull("isDeleted")]),
  ];

  if (types.length > 0) queries.push(Query.equal("type", types));
  if (searchText)
    queries.push(
      Query.or([
        Query.contains("name", searchText),
        Query.contains("extractedText", searchText),
      ]),
    );
  if (limit) queries.push(Query.limit(limit));

  if (sort) {
    const [sortBy, orderBy] = sort.split("-");

    queries.push(
      orderBy === "asc" ? Query.orderAsc(sortBy) : Query.orderDesc(sortBy),
    );
  }

  return queries;
};

export const getFiles = async ({
  types = [],
  searchText = "",
  sort = "$createdAt-desc",
  limit,
}: GetFilesProps) => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return parseStringify({ total: 0, documents: [] });
    }

    const queries = createQueries(currentUser, types, searchText, sort, limit);

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      queries,
    );

    console.log({ files });
    return parseStringify(files);
  } catch (error) {
    handleError(error, "Failed to get files");
  }
};

export const getFileById = async (fileId: string) => {
  const { databases } = await createAdminClient();

  try {
    const file = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
    );

    return parseStringify(file);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    handleError(error, "Failed to get file by id");
  }
};

export const renameFile = async ({
  fileId,
  name,
  extension,
  path,
}: RenameFileProps) => {
  const { databases } = await createAdminClient();

  try {
    const newName = `${name}.${extension}`;
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        name: newName,
      },
    );

    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

export const updateFileUsers = async ({
  fileId,
  emails,
  path,
}: UpdateFileUsersProps) => {
  const { databases } = await createAdminClient();

  try {
    // Fetch current file to diff existing vs new users
    const currentFile = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
    );

    const existingEmails: string[] = Array.isArray(currentFile.users)
      ? currentFile.users
      : [];
    const newlyAddedEmails = emails.filter(
      (email) => !existingEmails.includes(email),
    );

    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        users: emails,
      },
    );

    // Send notifications to newly added recipients (best-effort, never blocks)
    if (newlyAddedEmails.length > 0) {
      try {
        const sender = await getCurrentUser();
        const senderName = sender?.fullName ?? sender?.email ?? "Someone";
        const fileName: string = currentFile.name ?? "a file";

        await Promise.all(
          newlyAddedEmails.map(async (recipientEmail) => {
            try {
              const recipientResult = await databases.listDocuments(
                appwriteConfig.databaseId,
                appwriteConfig.usersCollectionId,
                [Query.equal("email", [recipientEmail]), Query.limit(1)],
              );

              const recipient = recipientResult.documents[0];

              if (!recipient) return;

              await createNotification({
                userId: recipient.$id,
                type: "file_shared",
                title: "File shared with you",
                message: `"${fileName}" was shared with you by ${senderName}.`,
                fileId,
                fileName,
              });
            } catch {
              // Silently skip if we can't notify this recipient
            }
          }),
        );
      } catch {
        // Notification errors must never fail the share operation
      }
    }

    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

export const deleteFile = async ({
  fileId,
  path,
}: DeleteFileProps) => {
  const { databases } = await createAdminClient();

  try {
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      { isDeleted: true, deletedAt: new Date().toISOString() },
    );
    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to move file to trash");
  }
};

export const restoreFile = async ({ fileId, path }: RestoreFileProps) => {
  const { databases } = await createAdminClient();

  try {
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      { isDeleted: false, deletedAt: null },
    );
    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to restore file");
  }
};

export const permanentlyDeleteFile = async ({
  fileId,
  bucketFileId,
  path,
}: DeleteFileProps) => {
  const { databases, storage } = await createAdminClient();

  try {
    try {
      await databases.deleteDocument(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        fileId,
      );
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    // Only delete the storage object when no other document still references it.
    let remainingRefs = 0;
    try {
      const refResult = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        [Query.equal("bucketFileId", [bucketFileId]), Query.limit(1)],
      );
      remainingRefs = refResult.total;
    } catch (error) {
      console.log("Reference check skipped, deleting storage file:", error);
    }

    if (remainingRefs === 0) {
      try {
        await storage.deleteFile(appwriteConfig.bucketId, bucketFileId);
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
    }

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to permanently delete file");
  }
};

export const getTrashedFiles = async () => {
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return parseStringify({ total: 0, documents: [] });

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      [
        Query.equal("owner", [currentUser.$id]),
        Query.equal("isDeleted", true),
        Query.orderDesc("$updatedAt"),
      ],
    );
    return parseStringify(files);
  } catch (error) {
    handleError(error, "Failed to fetch trashed files");
  }
};

// ============================== TOTAL FILE SPACE USED
export async function getTotalSpaceUsed() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return parseStringify({
        image: { size: 0, latestDate: "" },
        document: { size: 0, latestDate: "" },
        video: { size: 0, latestDate: "" },
        audio: { size: 0, latestDate: "" },
        other: { size: 0, latestDate: "" },
        used: 0,
        all: 2 * 1024 * 1024 * 1024,
      });
    }

    const { databases } = await createSessionClient();

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      [
        Query.equal("owner", [currentUser.$id]),
        Query.or([Query.equal("isDeleted", false), Query.isNull("isDeleted")]),
      ],
    );

    const totalSpace = {
      image: { size: 0, latestDate: "" },
      document: { size: 0, latestDate: "" },
      video: { size: 0, latestDate: "" },
      audio: { size: 0, latestDate: "" },
      other: { size: 0, latestDate: "" },
      used: 0,
      all: 2 * 1024 * 1024 * 1024 /* 2GB available bucket storage */,
    };

    files.documents.forEach((file) => {
      const fileType = file.type as FileType;
      totalSpace[fileType].size += file.size;
      totalSpace.used += file.size;

      if (
        !totalSpace[fileType].latestDate ||
        new Date(file.$updatedAt) > new Date(totalSpace[fileType].latestDate)
      ) {
        totalSpace[fileType].latestDate = file.$updatedAt;
      }
    });

    return parseStringify(totalSpace);
  } catch (error) {
    handleError(error, "Error calculating total space used:, ");
  }
}
