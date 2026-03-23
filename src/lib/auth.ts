import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

// Google OAuth scopes required for this app
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export const authOptions: NextAuthOptions = {
  // TODO: @auth/prisma-adapter type mismatch with next-auth v4 — cast needed
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (!account || account.provider !== "google") return true;

      try {
        // Upsert ConnectedAccount with encrypted tokens
        const accessTokenEncrypted = account.access_token
          ? encrypt(account.access_token)
          : "";
        const refreshTokenEncrypted = account.refresh_token
          ? encrypt(account.refresh_token)
          : undefined;

        const expiresAt = account.expires_at
          ? new Date(account.expires_at * 1000)
          : undefined;

        await prisma.connectedAccount.upsert({
          where: { userId_provider: { userId: user.id!, provider: "google" } },
          create: {
            userId: user.id!,
            provider: "google",
            accessTokenEncrypted,
            refreshTokenEncrypted,
            expiresAt,
            scope: account.scope,
            email: user.email,
          },
          update: {
            accessTokenEncrypted,
            refreshTokenEncrypted,
            expiresAt,
            scope: account.scope,
          },
        });

        // Ensure UserSettings exist
        await prisma.userSettings.upsert({
          where: { userId: user.id! },
          create: { userId: user.id! },
          update: {},
        });
      } catch (err) {
        console.error("Failed to store connected account:", err);
        // Don't block sign-in on token storage failure
      }

      return true;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
