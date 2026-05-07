const sampleBasePath = process.env.OPEN_SESSION_SAMPLE_BASE_PATH || "";
const staticExport = process.env.OPEN_SESSION_STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(sampleBasePath ? { basePath: sampleBasePath } : {}),
  ...(staticExport ? { output: "export" } : {}),
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@open-session/sdk", "@open-session/protocol"],
};

export default nextConfig;
