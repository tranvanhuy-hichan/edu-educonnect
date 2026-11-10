import { FileUploader } from "./file-uploader";
import { uploadLimit } from "@/lib/storage/config";

export { attachmentNames } from "@/modules/files/files.service";
import { attachmentNames } from "@/modules/files/files.service";
export async function AttachmentUpload({ name = "attachments", purpose, assignmentId, exerciseId, initialUrls = [], multiple = true }: { name?: string; purpose: string; assignmentId?: string; exerciseId?: string; initialUrls?: string[]; multiple?: boolean }) {
  return <FileUploader name={name} purpose={purpose} assignmentId={assignmentId} exerciseId={exerciseId} initialFiles={await attachmentNames(initialUrls)} multiple={multiple} maxBytes={uploadLimit()} />;
}
