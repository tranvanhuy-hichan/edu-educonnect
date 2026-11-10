// Tải logo mặc định (image.png ở gốc repo) lên Cloudinary và lưu vào SchoolSetting.
// Dùng @next/env để nạp .env giống hệt cách Next.js tự làm, không cần export tay.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import { v2 as cloudinary } from "cloudinary";
import { PrismaClient } from "@prisma/client";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const prisma = new PrismaClient();

const res = await cloudinary.uploader.upload("../image.png", {
  folder: "educonnect/school",
  public_id: "logo",
  overwrite: true,
  invalidate: true,
  resource_type: "image",
  transformation: [{ width: 512, height: 512, crop: "limit", quality: "auto:good" }],
});

await prisma.schoolSetting.upsert({
  where: { id: "school" },
  update: { logoUrl: res.secure_url, logoPublicId: res.public_id },
  create: { id: "school", schoolName: "EduConnect", logoUrl: res.secure_url, logoPublicId: res.public_id },
});

console.log("Đã lưu logo mặc định:", res.secure_url);
await prisma.$disconnect();
