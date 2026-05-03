import { NextResponse } from "next/server";

import {
  transcribeVideo,
  generateCaptions,
  summarizeVideo,
  extractVideoKeyPoints,
  translateVideoTranscript,
  askVideoQuestion,
} from "@/lib/actions/video-ai.actions";

type VideoAction =
  | "transcribe"
  | "captions"
  | "summarize"
  | "key_points"
  | "translate"
  | "ask";

type RequestBody = {
  action?: VideoAction;
  fileId?: string;
  path?: string;
  saveAsFile?: boolean;
  targetLanguage?: string;
  question?: string;
};

const VALID_ACTIONS: VideoAction[] = [
  "transcribe",
  "captions",
  "summarize",
  "key_points",
  "translate",
  "ask",
];

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { action, fileId, path = "/", saveAsFile = false } = body;

  if (!fileId) {
    return NextResponse.json(
      { error: "Missing required field: fileId" },
      { status: 400 },
    );
  }

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    switch (action) {
      case "transcribe": {
        const result = await transcribeVideo({ fileId, path, saveAsFile });
        return NextResponse.json(result, { status: 200 });
      }

      case "captions": {
        const result = await generateCaptions({ fileId, path, saveAsFile });
        return NextResponse.json(result, { status: 200 });
      }

      case "summarize": {
        const result = await summarizeVideo({ fileId, path, saveAsFile });
        return NextResponse.json(result, { status: 200 });
      }

      case "key_points": {
        const result = await extractVideoKeyPoints({ fileId, path, saveAsFile });
        return NextResponse.json(result, { status: 200 });
      }

      case "translate": {
        const { targetLanguage } = body;
        if (!targetLanguage?.trim()) {
          return NextResponse.json(
            { error: "Missing required field for translate: targetLanguage" },
            { status: 400 },
          );
        }
        const result = await translateVideoTranscript({
          fileId,
          path,
          targetLanguage: targetLanguage.trim(),
          saveAsFile,
        });
        return NextResponse.json(result, { status: 200 });
      }

      case "ask": {
        const { question } = body;
        if (!question?.trim()) {
          return NextResponse.json(
            { error: "Missing required field for ask: question" },
            { status: 400 },
          );
        }
        const result = await askVideoQuestion({
          fileId,
          question: question.trim(),
        });
        return NextResponse.json(result, { status: 200 });
      }
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while processing video AI action.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
