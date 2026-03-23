import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

export async function getGoogleClient(userId: string) {
  const account = await prisma.connectedAccount.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });

  if (!account) {
    throw new Error(`No Google account connected for user ${userId}`);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_BASE_URL}/api/auth/callback/google`
  );

  const accessToken = decrypt(account.accessTokenEncrypted);
  const refreshToken = account.refreshTokenEncrypted
    ? decrypt(account.refreshTokenEncrypted)
    : undefined;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: account.expiresAt ? account.expiresAt.getTime() : undefined,
  });

  // Auto-refresh and persist new tokens
  oauth2Client.on("tokens", async (tokens) => {
    try {
      await prisma.connectedAccount.update({
        where: { userId_provider: { userId, provider: "google" } },
        data: {
          accessTokenEncrypted: tokens.access_token
            ? encrypt(tokens.access_token)
            : account.accessTokenEncrypted,
          refreshTokenEncrypted:
            tokens.refresh_token
              ? encrypt(tokens.refresh_token)
              : account.refreshTokenEncrypted,
          expiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : account.expiresAt,
        },
      });
    } catch (err) {
      console.error("Failed to persist refreshed tokens:", err);
    }
  });

  return oauth2Client;
}
