"use server";

import Groq from "groq-sdk";
import { ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { revalidatePath } from "next/cache";

import { extractDocumentText } from "@/lib/ai/document-parser";
import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { constructFileUrl, getFileType, parseStringify } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Groq client
// ---------------------------------------------------------------------------

const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Missing GROQ_API_KEY environment variable. Add it to your .env.local file.",
    );
  }

  return new Groq({ apiKey });
};

// llama-3.3-70b-versatile: free tier, 14,400 req/day, 128K context, excellent quality
const GROQ_MODEL = "llama-3.3-70b-versatile";

const generateText = async (prompt: string): Promise<string> => {
  const groq = getGroqClient();

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
  });

  const text = completion.choices[0]?.message?.content;

  if (!text) {
    throw new Error("Groq returned an empty response. Please try again.");
  }

  return text;
};

// ---------------------------------------------------------------------------
// Helpers shared across all document AI actions
// ---------------------------------------------------------------------------

const getAiJobsCollectionId = () => {
  const id = appwriteConfig.aiJobsCollectionId;

  if (!id) return null; // AI Jobs collection is optional — skip tracking if not configured

  return id;
};

const getErrorMessage = (error: unknown) => {
  let raw = "";

  if (error instanceof Error) {
    raw = error.message;
  } else if (error && typeof error === "object" && "message" in error) {
    const e = error as { message?: unknown };
    if (typeof e.message === "string") raw = e.message;
  }

  if (!raw) return "An unknown error occurred.";

  // Quota / rate-limit errors from the Gemini SDK
  if (raw.includes("quota") || raw.includes("RESOURCE_EXHAUSTED") || raw.includes("QuotaFailure")) {
    return (
      "Gemini API quota exceeded. " +
      "You are on the free tier (15 req/min, 1,500 req/day). " +
      "Please wait a minute and try again, or check your usage at https://aistudio.google.com/."
    );
  }

  // API key / auth errors
  if (raw.includes("API_KEY_INVALID") || raw.includes("401") || raw.includes("403")) {
    return "Invalid or missing Gemini API key. Check GEMINI_API_KEY in your .env.local file.";
  }

  // Model not found
  if (raw.includes("404") || raw.includes("not found") || raw.includes("MODEL_NOT_FOUND")) {
    return "The requested Gemini model was not found. Check the model name in document-ai.actions.ts.";
  }

  return raw;
};

const getOwnerId = (owner: unknown) => {
  if (typeof owner === "string") return owner;

  if (owner && typeof owner === "object" && "$id" in owner) {
    return (owner as { $id?: string }).$id ?? "";
  }

  return "";
};

const getBaseName = (fileName: string) => {
  const parts = fileName.split(".");
  return parts.length <= 1 ? fileName : parts.slice(0, -1).join(".");
};

// ---------------------------------------------------------------------------
// AI Job tracking (no-op when collection is not configured)
// ---------------------------------------------------------------------------

const extractUnknownAttribute = (error: unknown) => {
  const message = getErrorMessage(error);
  const match = message.match(/unknown attribute\s*:?\s*"?([a-zA-Z0-9_]+)"?/i);
  return match?.[1] ?? null;
};

const removeAttributeCaseInsensitive = (
  payload: Record<string, string | number>,
  attributeName: string,
) => {
  const next = { ...payload };
  const key = Object.keys(next).find(
    (k) => k.toLowerCase() === attributeName.toLowerCase(),
  );

  if (!key) return null;

  delete next[key];
  return next;
};

const createDocumentAiJob = async ({
  fileId,
  userId,
  type,
  prompt,
  version,
}: {
  fileId: string;
  userId: string;
  type: string;
  prompt: string;
  version: number;
}) => {
  const collectionId = getAiJobsCollectionId();
  if (!collectionId) return null;

  const { databases } = await createAdminClient();

  let payload: Record<string, string | number> = {
    fileId,
    userId,
    type,
    status: "queued",
    provider: "groq",
    prompt,
    input: "",
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
        collectionId,
        ID.unique(),
        payload,
      );
    } catch (error) {
      const unknown = extractUnknownAttribute(error);
      if (!unknown) throw error;

      const sanitized = removeAttributeCaseInsensitive(payload, unknown);
      if (!sanitized) throw error;

      payload = sanitized;
    }
  }
};

const updateDocumentAiJob = async (
  jobId: string | null,
  updates: Record<string, string | number>,
) => {
  if (!jobId) return null;

  const collectionId = getAiJobsCollectionId();
  if (!collectionId) return null;

  const { databases } = await createAdminClient();
  let payload = { ...updates };

  while (true) {
    try {
      return await databases.updateDocument(
        appwriteConfig.databaseId,
        collectionId,
        jobId,
        payload,
      );
    } catch (error) {
      const unknown = extractUnknownAttribute(error);
      if (!unknown) throw error;

      const sanitized = removeAttributeCaseInsensitive(payload, unknown);
      if (!sanitized) throw error;

      payload = sanitized;
    }
  }
};

const getNextDocumentVersion = async (sourceFileId: string) => {
  const collectionId = getAiJobsCollectionId();
  if (!collectionId) return 1;

  const { databases } = await createAdminClient();
  const jobs = await databases.listDocuments(
    appwriteConfig.databaseId,
    collectionId,
    [Query.equal("sourceFileId", [sourceFileId])],
  );

  return jobs.total + 1;
};

// ---------------------------------------------------------------------------
// Core: fetch + validate + extract text
// ---------------------------------------------------------------------------

const prepareDocumentForAi = async (fileId: string) => {
  const { databases } = await createAdminClient();

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("User not authenticated.");

  const sourceFile = await databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    fileId,
  );

  const fileType = getFileType(sourceFile.name).type;
  if (fileType !== "document") {
    throw new Error("AI document tools only work on document files.");
  }

  const isOwner =
    sourceFile.accountId === currentUser.accountId ||
    getOwnerId(sourceFile.owner) === currentUser.$id;

  if (!isOwner) {
    throw new Error("Only the file owner can run AI document actions.");
  }

  const text = await extractDocumentText(sourceFile.url, sourceFile.extension);

  return { currentUser, sourceFile, text };
};

// ---------------------------------------------------------------------------
// Optional: save AI result as a new .md file in Appwrite storage
// ---------------------------------------------------------------------------

const saveResultAsFile = async ({
  resultText,
  sourceFileName,
  suffix,
  currentUser,
  version,
}: {
  resultText: string;
  sourceFileName: string;
  suffix: string;
  currentUser: { $id: string; accountId: string };
  version: number;
}) => {
  const { storage, databases } = await createAdminClient();

  const derivedFileName = `${getBaseName(sourceFileName)}-${suffix}-v${version}.md`;
  const buffer = Buffer.from(resultText, "utf-8");
  const inputFile = InputFile.fromBuffer(buffer, derivedFileName);

  const uploadedFile = await storage.createFile(
    appwriteConfig.bucketId,
    ID.unique(),
    inputFile,
  );

  const document = await databases.createDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    ID.unique(),
    {
      type: "document",
      name: derivedFileName,
      url: constructFileUrl(uploadedFile.$id),
      extension: "md",
      size: uploadedFile.sizeOriginal,
      owner: currentUser.$id,
      accountId: currentUser.accountId,
      users: [],
      bucketFileId: uploadedFile.$id,
    },
  );

  return document;
};

// ---------------------------------------------------------------------------
// Exported Server Actions
// ---------------------------------------------------------------------------

export const summarizeDocument = async ({
  fileId,
  path,
  saveAsFile = false,
}: DocumentAiActionProps & { saveAsFile?: boolean }) => {
  const { currentUser, sourceFile, text } = await prepareDocumentForAi(fileId);

  const version = await getNextDocumentVersion(fileId);
  const job = await createDocumentAiJob({
    fileId,
    userId: currentUser.$id,
    type: "document-summarize",
    prompt: "Summarize this document",
    version,
  });

  try {
    await updateDocumentAiJob(job?.$id ?? null, { status: "processing" });

    const summary = await generateText(
      `You are a document assistant. Summarize the following document in clear, concise bullet points.
Group related points under headings where helpful. Keep it factual and avoid adding information not present in the document.

Document content:
${text}`,
    );

    let savedFile = null;
    if (saveAsFile) {
      savedFile = await saveResultAsFile({
        resultText: summary,
        sourceFileName: sourceFile.name,
        suffix: "summary",
        currentUser,
        version,
      });
    }

    await updateDocumentAiJob(job?.$id ?? null, {
      status: "complete",
      aiResultText: summary,
      aiMetadata: JSON.stringify({ action: "summarize", provider: "groq" }),
      editedFileId: savedFile?.$id ?? "",
      editedFileUrl: savedFile?.url ?? "",
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({
      status: "success",
      result: summary,
      savedFile: savedFile ?? null,
    });
  } catch (error) {
    await updateDocumentAiJob(job?.$id ?? null, {
      status: "failed",
      processingError: getErrorMessage(error),
    });
    throw error;
  }
};

export const improveWriting = async ({
  fileId,
  path,
  saveAsFile = false,
}: DocumentAiActionProps & { saveAsFile?: boolean }) => {
  const { currentUser, sourceFile, text } = await prepareDocumentForAi(fileId);

  const version = await getNextDocumentVersion(fileId);
  const job = await createDocumentAiJob({
    fileId,
    userId: currentUser.$id,
    type: "document-improve",
    prompt: "Improve writing quality",
    version,
  });

  try {
    await updateDocumentAiJob(job?.$id ?? null, { status: "processing" });

    const improved = await generateText(
      `You are a professional editor. Improve the writing quality of the following document.
Fix grammar, punctuation, and spelling errors. Improve clarity and flow.
Preserve the original meaning and tone. Return only the improved text, no explanations.

Document content:
${text}`,
    );

    let savedFile = null;
    if (saveAsFile) {
      savedFile = await saveResultAsFile({
        resultText: improved,
        sourceFileName: sourceFile.name,
        suffix: "improved",
        currentUser,
        version,
      });
    }

    await updateDocumentAiJob(job?.$id ?? null, {
      status: "complete",
      aiResultText: improved,
      aiMetadata: JSON.stringify({ action: "improve-writing", provider: "groq" }),
      editedFileId: savedFile?.$id ?? "",
      editedFileUrl: savedFile?.url ?? "",
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({
      status: "success",
      result: improved,
      savedFile: savedFile ?? null,
    });
  } catch (error) {
    await updateDocumentAiJob(job?.$id ?? null, {
      status: "failed",
      processingError: getErrorMessage(error),
    });
    throw error;
  }
};

export const translateDocument = async ({
  fileId,
  targetLanguage,
  path,
  saveAsFile = false,
}: DocumentAiActionProps & { targetLanguage: string; saveAsFile?: boolean }) => {
  const { currentUser, sourceFile, text } = await prepareDocumentForAi(fileId);

  const version = await getNextDocumentVersion(fileId);
  const job = await createDocumentAiJob({
    fileId,
    userId: currentUser.$id,
    type: "document-translate",
    prompt: `Translate to ${targetLanguage}`,
    version,
  });

  try {
    await updateDocumentAiJob(job?.$id ?? null, { status: "processing" });

    const translated = await generateText(
      `Translate the following document into ${targetLanguage}.
Preserve formatting, paragraph structure, and headings. Return only the translated text.

Document content:
${text}`,
    );

    let savedFile = null;
    if (saveAsFile) {
      savedFile = await saveResultAsFile({
        resultText: translated,
        sourceFileName: sourceFile.name,
        suffix: `translated-${targetLanguage.toLowerCase().replace(/\s+/g, "-")}`,
        currentUser,
        version,
      });
    }

    await updateDocumentAiJob(job?.$id ?? null, {
      status: "complete",
      aiResultText: translated,
      aiMetadata: JSON.stringify({
        action: "translate",
        targetLanguage,
        provider: "groq",
      }),
      editedFileId: savedFile?.$id ?? "",
      editedFileUrl: savedFile?.url ?? "",
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({
      status: "success",
      result: translated,
      savedFile: savedFile ?? null,
    });
  } catch (error) {
    await updateDocumentAiJob(job?.$id ?? null, {
      status: "failed",
      processingError: getErrorMessage(error),
    });
    throw error;
  }
};

export const askDocumentQuestion = async ({
  fileId,
  question,
  path,
}: DocumentAiActionProps & { question: string }) => {
  const { currentUser, sourceFile: _sourceFile, text } =
    await prepareDocumentForAi(fileId);

  const version = await getNextDocumentVersion(fileId);
  const job = await createDocumentAiJob({
    fileId,
    userId: currentUser.$id,
    type: "document-qa",
    prompt: question,
    version,
  });

  try {
    await updateDocumentAiJob(job?.$id ?? null, { status: "processing" });

    const answer = await generateText(
      `You are a document assistant. Answer the following question using only the information in the provided document.
If the answer is not found in the document, say so clearly. Be concise and accurate.

Question: ${question}

Document content:
${text}`,
    );

    await updateDocumentAiJob(job?.$id ?? null, {
      status: "complete",
      aiResultText: answer,
      aiMetadata: JSON.stringify({
        action: "qa",
        question,
        provider: "groq",
      }),
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({ status: "success", result: answer });
  } catch (error) {
    await updateDocumentAiJob(job?.$id ?? null, {
      status: "failed",
      processingError: getErrorMessage(error),
    });
    throw error;
  }
};

export const extractKeyPoints = async ({
  fileId,
  path,
  saveAsFile = false,
}: DocumentAiActionProps & { saveAsFile?: boolean }) => {
  const { currentUser, sourceFile, text } = await prepareDocumentForAi(fileId);

  const version = await getNextDocumentVersion(fileId);
  const job = await createDocumentAiJob({
    fileId,
    userId: currentUser.$id,
    type: "document-keypoints",
    prompt: "Extract key points",
    version,
  });

  try {
    await updateDocumentAiJob(job?.$id ?? null, { status: "processing" });

    const keyPoints = await generateText(
      `Extract the key points from the following document.
Include: main topics, important facts, dates, names, action items, and conclusions.
Format as a structured list with clear categories. Be thorough but concise.

Document content:
${text}`,
    );

    let savedFile = null;
    if (saveAsFile) {
      savedFile = await saveResultAsFile({
        resultText: keyPoints,
        sourceFileName: sourceFile.name,
        suffix: "key-points",
        currentUser,
        version,
      });
    }

    await updateDocumentAiJob(job?.$id ?? null, {
      status: "complete",
      aiResultText: keyPoints,
      aiMetadata: JSON.stringify({ action: "key-points", provider: "groq" }),
      editedFileId: savedFile?.$id ?? "",
      editedFileUrl: savedFile?.url ?? "",
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({
      status: "success",
      result: keyPoints,
      savedFile: savedFile ?? null,
    });
  } catch (error) {
    await updateDocumentAiJob(job?.$id ?? null, {
      status: "failed",
      processingError: getErrorMessage(error),
    });
    throw error;
  }
};

export const rewriteWithTone = async ({
  fileId,
  tone,
  path,
  saveAsFile = false,
}: DocumentAiActionProps & { tone: DocumentTone; saveAsFile?: boolean }) => {
  const toneDescriptions: Record<DocumentTone, string> = {
    formal: "formal and professional, suitable for business or academic contexts",
    casual: "casual and conversational, friendly and easy to read",
    technical:
      "technical and precise, using domain-specific terminology where appropriate",
    simplified:
      "simple and easy to understand, avoiding jargon, suitable for a general audience",
  };

  const { currentUser, sourceFile, text } = await prepareDocumentForAi(fileId);

  const version = await getNextDocumentVersion(fileId);
  const job = await createDocumentAiJob({
    fileId,
    userId: currentUser.$id,
    type: "document-rewrite-tone",
    prompt: `Rewrite with ${tone} tone`,
    version,
  });

  try {
    await updateDocumentAiJob(job?.$id ?? null, { status: "processing" });

    const rewritten = await generateText(
      `Rewrite the following document in a ${toneDescriptions[tone]} style.
Preserve all the original information and meaning. Return only the rewritten text, no explanations.

Document content:
${text}`,
    );

    let savedFile = null;
    if (saveAsFile) {
      savedFile = await saveResultAsFile({
        resultText: rewritten,
        sourceFileName: sourceFile.name,
        suffix: `tone-${tone}`,
        currentUser,
        version,
      });
    }

    await updateDocumentAiJob(job?.$id ?? null, {
      status: "complete",
      aiResultText: rewritten,
      aiMetadata: JSON.stringify({
        action: "rewrite-tone",
        tone,
        provider: "groq",
      }),
      editedFileId: savedFile?.$id ?? "",
      editedFileUrl: savedFile?.url ?? "",
      processingError: "",
    });

    revalidatePath(path);

    return parseStringify({
      status: "success",
      result: rewritten,
      savedFile: savedFile ?? null,
    });
  } catch (error) {
    await updateDocumentAiJob(job?.$id ?? null, {
      status: "failed",
      processingError: getErrorMessage(error),
    });
    throw error;
  }
};
