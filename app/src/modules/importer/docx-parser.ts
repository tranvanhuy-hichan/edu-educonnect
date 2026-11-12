import JSZip from "jszip";
import { parseStringPromise } from "xml2js";
import { attrOf, child, kidsOf, nameOf, ommlToLatex, textOf, type XmlNode } from "./omml";

export type DocxImage = { n: number; name: string; mime: string; data: Buffer; supported: boolean };
export type ParsedDocx = { text: string; images: DocxImage[] };

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", emf: "image/x-emf", wmf: "image/x-wmf", tif: "image/tiff", tiff: "image/tiff" };
const UPLOADABLE = new Set(["image/png", "image/jpeg", "image/webp"]);

const xml = (s: string) =>
  parseStringPromise(s, { explicitChildren: true, preserveChildrenOrder: true, charsAsChildren: true, includeWhiteChars: true, explicitArray: true, explicitRoot: false, trim: false, normalize: false }) as Promise<XmlNode>;

/** Tìm mọi quan hệ ảnh (a:blip r:embed / v:imagedata r:id) bên trong một nút, theo thứ tự xuất hiện. */
function imageRels(n: XmlNode, out: string[] = []): string[] {
  const rid = nameOf(n) === "a:blip" ? attrOf(n, "r:embed") : nameOf(n) === "v:imagedata" ? attrOf(n, "r:id") : undefined;
  if (rid && !out.includes(rid)) out.push(rid);
  for (const k of kidsOf(n)) imageRels(k, out);
  return out;
}

/** Chữ gạch chân hoặc tô nền thường dùng để đánh dấu đáp án đúng. */
const isMarked = (r: XmlNode) => {
  const rPr = child(r, "w:rPr");
  const u = attrOf(child(rPr, "w:u"), "w:val");
  const h = child(rPr, "w:highlight");
  return (u !== undefined && u !== "none") || (h !== undefined && attrOf(h, "w:val") !== "none");
};

/** Đọc tệp Word: văn bản theo thứ tự, công thức thành LaTeX trong $...$, ảnh nhúng thành [[IMG:n]] (và trả ra dữ liệu ảnh). */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocx> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Tệp Word không hợp lệ (thiếu nội dung văn bản)");
  const doc = await xml(await docFile.async("string"));
  const relFile = zip.file("word/_rels/document.xml.rels");
  const rels = new Map<string, string>();
  if (relFile) for (const r of kidsOf(await xml(await relFile.async("string")))) if (nameOf(r) === "Relationship" && r.$?.Id && r.$.Target) rels.set(r.$.Id, r.$.Target);

  const images: DocxImage[] = [];
  const byTarget = new Map<string, number>();
  const imageMarker = async (rid: string): Promise<string> => {
    const target = rels.get(rid);
    if (!target) return "";
    const path = target.startsWith("/") ? target.slice(1) : `word/${target}`;
    let n = byTarget.get(path);
    if (n === undefined) {
      const file = zip.file(path);
      if (!file) return "";
      const ext = (path.split(".").pop() ?? "").toLowerCase();
      const mime = IMAGE_MIME[ext] ?? "application/octet-stream";
      n = images.length + 1;
      images.push({ n, name: path.split("/").pop() ?? `image${n}`, mime, data: Buffer.from(await file.async("uint8array")), supported: UPLOADABLE.has(mime) });
      byTarget.set(path, n);
    }
    return `[[IMG:${n}]]`;
  };

  const inline = async (nodes: XmlNode[]): Promise<string> => {
    let out = "";
    for (const k of nodes) {
      switch (nameOf(k)) {
        case "w:r": {
          let t = "";
          for (const c of kidsOf(k)) {
            const nm = nameOf(c);
            if (nm === "w:t") t += textOf(c);
            else if (nm === "w:tab") t += "\t";
            else if (nm === "w:br" || nm === "w:cr") t += "\n";
            else if (nm === "w:drawing" || nm === "w:pict" || nm === "w:object" || nm === "mc:AlternateContent") for (const rid of imageRels(c)) t += await imageMarker(rid);
            else if (nm === "m:oMath") t += `$${ommlToLatex(c)}$`;
          }
          out += t.trim() && isMarked(k) ? `<u>${t}</u>` : t;
          break;
        }
        case "m:oMath": out += `$${ommlToLatex(k)}$`; break;
        case "m:oMathPara": out += kidsOf(k).filter((m) => nameOf(m) === "m:oMath").map((m) => `$$${ommlToLatex(m)}$$`).join(" "); break;
        case "w:hyperlink": case "w:ins": case "w:smartTag": case "w:fldSimple": case "w:sdtContent": case "w:sdt": out += await inline(kidsOf(k)); break;
        default: break;
      }
    }
    return out;
  };

  const lines: string[] = [];
  const block = async (nodes: XmlNode[]): Promise<void> => {
    for (const k of nodes) {
      const nm = nameOf(k);
      if (nm === "w:p") lines.push((await inline(kidsOf(k))).replace(/[ \t]+$/g, ""));
      else if (nm === "w:tbl") {
        for (const tr of kidsOf(k).filter((r) => nameOf(r) === "w:tr")) {
          const cells: string[] = [];
          for (const tc of kidsOf(tr).filter((c) => nameOf(c) === "w:tc")) {
            const parts: string[] = [];
            for (const p of kidsOf(tc).filter((x) => nameOf(x) === "w:p")) parts.push((await inline(kidsOf(p))).trim());
            cells.push(parts.filter(Boolean).join(" "));
          }
          lines.push(`| ${cells.join(" | ")} |`);
        }
      } else if (nm === "w:sdt" || nm === "w:sdtContent") await block(kidsOf(k));
    }
  };
  await block(kidsOf(child(doc, "w:body")));

  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), images };
}
