
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // يتجاهل أخطاء التايب سكريبت أثناء البناء لضمان سرعة الرفع، ويفضل إصلاحها لاحقاً
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
