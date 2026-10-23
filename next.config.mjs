/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: `next build` emits a self-contained `out/` folder that any
  // static server (nginx) can serve — no Node runtime needed on the VPS.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
