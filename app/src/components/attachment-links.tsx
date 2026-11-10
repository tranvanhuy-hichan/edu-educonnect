import { FileText } from "lucide-react";
import { attachmentNames } from "./attachment-upload";
export async function AttachmentLinks({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  const files = await attachmentNames(urls);
  return <ul className="my-3 space-y-2">{files.map((file) => <li key={file.url}><a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-orange-700 hover:underline"><FileText className="size-4 shrink-0" /><span className="truncate">{file.name}</span></a></li>)}</ul>;
}
