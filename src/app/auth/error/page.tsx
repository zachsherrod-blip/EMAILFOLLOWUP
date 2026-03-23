"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ErrorContent() {
  const params = useSearchParams();
  const error = params.get("error");

  const messages: Record<string, string> = {
    OAuthSignin: "Error starting OAuth sign-in flow.",
    OAuthCallback: "Error during OAuth callback.",
    OAuthCreateAccount: "Could not create OAuth account.",
    EmailCreateAccount: "Could not create email account.",
    Callback: "Error during callback.",
    OAuthAccountNotLinked: "Account already linked to different provider.",
    AccessDenied: "Access denied. Please grant the required permissions.",
    Configuration: "Server configuration error.",
    Default: "An error occurred during sign-in.",
  };

  const message = messages[error ?? "Default"] ?? messages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="max-w-sm w-full px-6 py-10 bg-white rounded-xl shadow-sm text-center">
        <div className="text-2xl mb-3">⚠️</div>
        <h1 className="text-lg font-bold text-slate-900 mb-2">Sign-in Error</h1>
        <p className="text-sm text-slate-500 mb-6">{message}</p>
        <Link
          href="/auth/signin"
          className="inline-flex items-center justify-center px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
