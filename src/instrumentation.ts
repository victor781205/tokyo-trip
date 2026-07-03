import * as Sentry from "@sentry/nextjs";

// Only initialize Sentry if DSN is configured
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,

    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Error sampling (capture more errors in production)
    sampleRate: 1.0,

    // Enable debug mode in development
    debug: process.env.NODE_ENV === "development",

    // Environment
    environment: process.env.NODE_ENV,

    // Replay for better debugging
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,

    // Ignore certain errors
    ignoreErrors: [
      // Ignore network errors that are handled gracefully
      "TypeError: Failed to fetch",
      "TypeError: Network request failed",
      // Ignore browser extensions
      "Extension context invalidated",
    ],

    // Attach stacktrace
    attachStacktrace: true,

    // Include sourcemaps in production
    normalizeDepth: 5,
  });
}