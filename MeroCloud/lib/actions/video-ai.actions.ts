"use server";

import Groq, { toFile } from "groq-sdk";
import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { revalidatePath } from "next/cache";

import { fetchVideoBuffer, extractAudioBuffer } from "@/lib/ai/audio-extractor";
import { createAdminClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { constructFileUrl, getFileType, parseStringify } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Groq client — reuses the same key as document AI
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

const WHISPER_MODEL = "whisper-large-v3";
const LLAMA_MODEL   = "llama-3.3-70b-versatile";

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

const getErrorMessage = (error: unknown): string => {
  let raw = "";
  if (error instanceof Error) {
    raw = error.message;
  } else if (error && typeof error === "object" && "message" in error) {
    const e = error as { message?: unknown };
    if (typeof e.message === "string") raw = e.message;
  }
  if (!raw) return "An unknown error occurred.";

  if (raw.includes("quota") || raw.includes("RESOURCE_EXHAUSTED") || raw.includes("QuotaFailure") || raw.includes("rate_limit")) {
    return (
      "Groq API quota exceeded (free tier: ~2,000 audio min/day). " +
      "Please wait a moment and try again."
    );
  }
  if (raw.includes("API_KEY_INVALID") || raw.includes("401") || raw.includes("403")) {
    return "Invalid or missing Groq API key. Check GROQ_API_KEY in your .env.local file.";
  }
  return raw;
};

// ---------------------------------------------------------------------------
// SRT helpers
// ---------------------------------------------------------------------------

const toSrtTime = (seconds: number): string => {
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
};

const buildSrt = (segments: Array<{ start: number; end: number; text: string }>): string =>
  segments
    .map((seg, i) => `${i + 1}\n${toSrtTime(seg.start)} --> ${toSrtTime(seg.end)}\n${seg.text.trim()}`)
    .join("\n\n");

// ---------------------------------------------------------------------------
// Core: fetch + validate + extract audio
// ---------------------------------------------------------------------------

const prepareVideoForAi = async (fileId: string) => {
  const { databases } = await createAdminClient();

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("User not authenticated.");

  const sourceFile = await databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    fileId,
  );

  const fileType = getFileType(sourceFile.name).type;
  if (fileType !== "video") {
    throw new Error("Video AI tools only work on video files.");
  }

  const isOwner =
    sourceFile.accountId === currentUser.accountId ||
    (typeof sourceFile.owner === "object" &&
      sourceFile.owner !== null &&
      "$id" in sourceFile.owner &&
      (sourceFile.owner as { $id: string }).$id === currentUser.$id);

  if (!isOwner) {
    throw new Error("Only the file owner can run AI video actions.");
  }

  const videoBuffer = await fetchVideoBuffer(sourceFile.url);
  const audioBuffer = await extractAudioBuffer(videoBuffer, sourceFile.extension || "mp4");

  return { currentUser, sourceFile, audioBuffer };
};

// ---------------------------------------------------------------------------
// Optional: save result as a new file in Appwrite storage
// ---------------------------------------------------------------------------

const saveResultAsFile = async ({
  content,
  fileName,
  currentUser,
}: {
  content: string;
  fileName: string;
  currentUser: { $id: string; accountId: string };
}) => {
  const { storage, databases } = await createAdminClient();

  const buffer    = Buffer.from(content, "utf-8");
  const inputFile = InputFile.fromBuffer(buffer, fileName);

  const uploadedFile = await storage.createFile(
    appwriteConfig.bucketId,
    ID.unique(),
    inputFile,
  );

  const ext = fileName.split(".").pop() ?? "txt";

  return await databases.createDocument(
    appwriteConfig.databaseId,
    appwriteConfig.filesCollectionId,
    ID.unique(),
    {
      type: "document",
      name: fileName,
      url: constructFileUrl(uploadedFile.$id),
      extension: ext,
      size: uploadedFile.sizeOriginal,
      owner: currentUser.$id,
      accountId: currentUser.accountId,
      users: [],
      bucketFileId: uploadedFile.$id,
    },
  );
};

// ---------------------------------------------------------------------------
// LLM helper (same Groq key, Llama model)
// ---------------------------------------------------------------------------

const generateText = async (prompt: string): Promise<string> => {
  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    model: LLAMA_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty response. Please try again.");
  return text;
};

// ---------------------------------------------------------------------------
// Exported Server Actions
// ---------------------------------------------------------------------------

export const transcribeVideo = async ({
  fileId,
  path,
  saveAsFile = false,
}: {
  fileId: string;
  path: string;
  saveAsFile?: boolean;
}) => {
  try {
    const { currentUser, sourceFile, audioBuffer } = await prepareVideoForAi(fileId);
    const groq = getGroqClient();

    const transcription = await groq.audio.transcriptions.create({
      file:            await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" }),
      model:           WHISPER_MODEL,
      response_format: "text",
    });

    const text = typeof transcription === "string" ? transcription : (transcription as { text: string }).text;

    let savedFile = null;
    if (saveAsFile) {
      const baseName = sourceFile.name.replace(/\.[^.]+$/, "");
      savedFile = await saveResultAsFile({
        content:     text,
        fileName:    `${baseName}-transcript.txt`,
        currentUser,
      });
    }

    revalidatePath(path);
    return parseStringify({ status: "success", result: text, savedFile: savedFile ?? null });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const generateCaptions = async ({
  fileId,
  path,
  saveAsFile = false,
}: {
  fileId: string;
  path: string;
  saveAsFile?: boolean;
}) => {
  try {
    const { currentUser, sourceFile, audioBuffer } = await prepareVideoForAi(fileId);
    const groq = getGroqClient();

    const transcription = await groq.audio.transcriptions.create({
      file:            await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" }),
      model:           WHISPER_MODEL,
      response_format: "verbose_json",
    }) as unknown as { segments: Array<{ start: number; end: number; text: string }> };

    const srt = buildSrt(transcription.segments ?? []);

    let savedFile = null;
    if (saveAsFile) {
      const baseName = sourceFile.name.replace(/\.[^.]+$/, "");
      savedFile = await saveResultAsFile({
        content:     srt,
        fileName:    `${baseName}-captions.srt`,
        currentUser,
      });
    }

    revalidatePath(path);
    return parseStringify({ status: "success", result: srt, savedFile: savedFile ?? null });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const summarizeVideo = async ({
  fileId,
  path,
  saveAsFile = false,
}: {
  fileId: string;
  path: string;
  saveAsFile?: boolean;
}) => {
  try {
    const { currentUser, sourceFile, audioBuffer } = await prepareVideoForAi(fileId);
    const groq = getGroqClient();

    const transcription = await groq.audio.transcriptions.create({
      file:            await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" }),
      model:           WHISPER_MODEL,
      response_format: "text",
    });

    const transcript = typeof transcription === "string" ? transcription : (transcription as { text: string }).text;

    const summary = await generateText(
      `You are a helpful assistant. Summarize the following video transcript in clear, concise bullet points.
Group related points under headings where helpful. Stay factual and do not add information not in the transcript.

Transcript:
${transcript}`,
    );

    let savedFile = null;
    if (saveAsFile) {
      const baseName = sourceFile.name.replace(/\.[^.]+$/, "");
      savedFile = await saveResultAsFile({
        content:     summary,
        fileName:    `${baseName}-summary.txt`,
        currentUser,
      });
    }

    revalidatePath(path);
    return parseStringify({ status: "success", result: summary, savedFile: savedFile ?? null });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const extractVideoKeyPoints = async ({
  fileId,
  path,
  saveAsFile = false,
}: {
  fileId: string;
  path: string;
  saveAsFile?: boolean;
}) => {
  try {
    const { currentUser, sourceFile, audioBuffer } = await prepareVideoForAi(fileId);
    const groq = getGroqClient();

    const transcription = await groq.audio.transcriptions.create({
      file:            await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" }),
      model:           WHISPER_MODEL,
      response_format: "text",
    });

    const transcript = typeof transcription === "string" ? transcription : (transcription as { text: string }).text;

    const keyPoints = await generateText(
      `Extract the key points from the following video transcript.
Include: main topics, important facts, names, dates, decisions, and action items.
Format as a structured list with clear categories.

Transcript:
${transcript}`,
    );

    let savedFile = null;
    if (saveAsFile) {
      const baseName = sourceFile.name.replace(/\.[^.]+$/, "");
      savedFile = await saveResultAsFile({
        content:     keyPoints,
        fileName:    `${baseName}-key-points.txt`,
        currentUser,
      });
    }

    revalidatePath(path);
    return parseStringify({ status: "success", result: keyPoints, savedFile: savedFile ?? null });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const translateVideoTranscript = async ({
  fileId,
  targetLanguage,
  path,
  saveAsFile = false,
}: {
  fileId: string;
  targetLanguage: string;
  path: string;
  saveAsFile?: boolean;
}) => {
  try {
    const { currentUser, sourceFile, audioBuffer } = await prepareVideoForAi(fileId);
    const groq = getGroqClient();

    const transcription = await groq.audio.transcriptions.create({
      file:            await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" }),
      model:           WHISPER_MODEL,
      response_format: "text",
    });

    const transcript = typeof transcription === "string" ? transcription : (transcription as { text: string }).text;

    const translated = await generateText(
      `Translate the following video transcript into ${targetLanguage}.
Preserve paragraph structure. Return only the translated text, no explanations.

Transcript:
${transcript}`,
    );

    let savedFile = null;
    if (saveAsFile) {
      const baseName    = sourceFile.name.replace(/\.[^.]+$/, "");
      const langSlug    = targetLanguage.toLowerCase().replace(/\s+/g, "-");
      savedFile = await saveResultAsFile({
        content:     translated,
        fileName:    `${baseName}-transcript-${langSlug}.txt`,
        currentUser,
      });
    }

    revalidatePath(path);
    return parseStringify({ status: "success", result: translated, savedFile: savedFile ?? null });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const askVideoQuestion = async ({
  fileId,
  question,
}: {
  fileId: string;
  question: string;
}) => {
  try {
    const { audioBuffer } = await prepareVideoForAi(fileId);
    const groq = getGroqClient();

    const transcription = await groq.audio.transcriptions.create({
      file:            await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" }),
      model:           WHISPER_MODEL,
      response_format: "text",
    });

    const transcript = typeof transcription === "string" ? transcription : (transcription as { text: string }).text;

    const answer = await generateText(
      `You are a helpful assistant. Answer the following question using only the information in the provided video transcript.
If the answer is not in the transcript, say so clearly.

Question: ${question}

Transcript:
${transcript}`,
    );

    return parseStringify({ status: "success", result: answer });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
