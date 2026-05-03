import { NextResponse } from "next/server";

import { removeImageBackground } from "@/lib/actions/ai.actions";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      fileId?: string;
      path?: string;
      prompt?: string;
    };

    if (!body.fileId) {
      return NextResponse.json(
        { error: "Missing required field: fileId" },
        { status: 400 },
      );
    }

    const result = await removeImageBackground({
      fileId: body.fileId,
      path: body.path || "/",
      prompt: body.prompt,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while removing image background.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
