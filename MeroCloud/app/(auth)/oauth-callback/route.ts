import { NextRequest, NextResponse } from "next/server";
import { Client, Account, Databases, Query, ID } from "node-appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { avatarPlaceholderUrl } from "@/constants";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const secret = searchParams.get("secret") ?? "";

  if (!userId || !secret) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  try {
    // Single admin client reused for session creation and DB operations
    const adminClient = new Client()
      .setEndpoint(appwriteConfig.endpointUrl)
      .setProject(appwriteConfig.projectId)
      .setKey(appwriteConfig.secretKey);

    const session = await new Account(adminClient).createSession(userId, secret);

    // Read the user info using the new session
    const sessionClient = new Client()
      .setEndpoint(appwriteConfig.endpointUrl)
      .setProject(appwriteConfig.projectId)
      .setSession(session.secret);

    const userAccount = await new Account(sessionClient).get();

    const databases = new Databases(adminClient);

    const existing = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.usersCollectionId,
      [Query.equal("accountId", [userAccount.$id])],
    );

    if (existing.total === 0) {
      await databases.createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.usersCollectionId,
        ID.unique(),
        {
          fullName: userAccount.name || userAccount.email.split("@")[0],
          email: userAccount.email,
          avatar: avatarPlaceholderUrl,
          accountId: userAccount.$id,
        },
      );
    }

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Google OAuth callback failed:", msg);
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("oauthError", msg);
    return NextResponse.redirect(url);
  }
}
