const TYPES: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  mp3: "audio/mpeg", mp4: "video/mp4", zip: "application/zip",
};
export const FILE_ACCEPT = Object.keys(TYPES).map((extension) => `.${extension}`).join(",");
export const FILE_PATH = /^\/api\/files\/[a-z0-9]+$/;
export const validAttachment = (value: string) => FILE_PATH.test(value) || /^https?:\/\/[^\s"'<>()]+$/.test(value);
export function attachmentLinks(raw: string) {
  const values = [...new Set(raw.split("\n").map((value) => value.trim()).filter(Boolean))];
  if (values.length > 10 || values.some((value) => !validAttachment(value))) throw new Error("Tối đa 10 tệp hoặc đường dẫn đính kèm hợp lệ");
  return values;
}
export function validateUpload(name: string, size: number, limit: number) {
  const fileName = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(-180);
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[extension]) throw new Error("Định dạng tệp chưa được hỗ trợ. Chọn tài liệu, ảnh, ZIP, MP3 hoặc MP4.");
  if (!Number.isSafeInteger(size) || size <= 0 || size > limit) throw new Error(`Tệp phải có dữ liệu và không quá ${limit / 1024 / 1024} MB`);
  return { fileName, extension, mimeType: TYPES[extension] };
}
export function attachmentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
