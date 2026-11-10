import "server-only";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

const ROOT = "educonnect";

export const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

function configure() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** Logo trường: ảnh vuông nhỏ, nén tốt — đủ nét cho sidebar/trang đăng nhập, nhẹ cho gói miễn phí. */
export function uploadSchoolLogo(buffer: Buffer): Promise<UploadApiResponse> {
  configure();
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `${ROOT}/school`,
          public_id: "logo",
          overwrite: true,
          invalidate: true,
          resource_type: "image",
          transformation: [{ width: 512, height: 512, crop: "limit", quality: "auto:good" }],
        },
        (err, res) => (err || !res ? reject(err ?? new Error("Upload thất bại")) : resolve(res)),
      )
      .end(buffer);
  });
}

export async function deleteImage(publicId: string | null | undefined) {
  if (!publicId || !isCloudinaryConfigured()) return;
  configure();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (e) {
    console.error("[cloudinary] delete failed", e);
  }
}
