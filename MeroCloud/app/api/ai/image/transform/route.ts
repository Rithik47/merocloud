import { NextResponse } from "next/server";

import { transformImageWithAction } from "@/lib/actions/ai.actions";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      fileId?: string;
      path?: string;
      actionKey?: string;
    };

    if (!body.fileId) {
      return NextResponse.json(
        { error: "Missing required field: fileId" },
        { status: 400 },
      );
    }

    if (!body.actionKey) {
      return NextResponse.json(
        { error: "Missing required field: actionKey" },
        { status: 400 },
      );
    }

    const result = await transformImageWithAction({
      fileId: body.fileId,
      path: body.path || "/",
      actionKey: body.actionKey,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while transforming image preset.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
