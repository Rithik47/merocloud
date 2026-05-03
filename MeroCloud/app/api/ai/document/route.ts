import { NextResponse } from "next/server";

import {
  summarizeDocument,
  improveWriting,
  translateDocument,
  askDocumentQuestion,
  extractKeyPoints,
  rewriteWithTone,
} from "@/lib/actions/document-ai.actions";

type DocumentAction =
  | "summarize"
  | "improve"
  | "translate"
  | "ask"
  | "key_points"
  | "rewrite_tone";

type RequestBody = {
  action?: DocumentAction;
  fileId?: string;
  path?: string;
  saveAsFile?: boolean;
  // action-specific fields
  targetLanguage?: string;
  question?: string;
  tone?: DocumentTone;
};

const VALID_ACTIONS: DocumentAction[] = [
  "summarize",
  "improve",
  "translate",
  "ask",
  "key_points",
  "rewrite_tone",
];

const VALID_TONES: DocumentTone[] = [
  "formal",
  "casual",
  "technical",
  "simplified",
];

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
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
      {
        error: `Missing or invalid field: action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    switch (action) {
      case "summarize": {
        const result = await summarizeDocument({ fileId, path, saveAsFile });
        return NextResponse.json(result, { status: 200 });
      }

      case "improve": {
        const result = await improveWriting({ fileId, path, saveAsFile });
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

        const result = await translateDocument({
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

        const result = await askDocumentQuestion({
          fileId,
          path,
          question: question.trim(),
        });

        return NextResponse.json(result, { status: 200 });
      }

      case "key_points": {
        const result = await extractKeyPoints({ fileId, path, saveAsFile });
        return NextResponse.json(result, { status: 200 });
      }

      case "rewrite_tone": {
        const { tone } = body;

        if (!tone || !VALID_TONES.includes(tone)) {
          return NextResponse.json(
            {
              error: `Missing or invalid field for rewrite_tone: tone. Must be one of: ${VALID_TONES.join(", ")}`,
            },
            { status: 400 },
          );
        }

        const result = await rewriteWithTone({ fileId, path, tone, saveAsFile });
        return NextResponse.json(result, { status: 200 });
      }
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while processing document AI action.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
