/** @type {import('next').NextConfig} */
const nextConfig = {
  /* The app is previewed through a local proxy, which Next treats as a
     cross-origin request and refuses to serve dev resources to by default.
     Without this the client bundle never hydrates in the preview. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
