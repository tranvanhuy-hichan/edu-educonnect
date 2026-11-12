import JSZip from "jszip";
import { deflateSync } from "node:zlib";

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

export function tinyPng(): Buffer {
  const w = 8, h = 8;
  let raw = Buffer.alloc(0);
  for (let y = 0; y < h; y++) raw = Buffer.concat([raw, Buffer.from([0]), Buffer.from(Array.from({ length: w * 3 }, (_, i) => (i * 7 + y * 13) % 256))]);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const t = (s: string) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;
const mr = (s: string) => `<m:r><m:t>${s}</m:t></m:r>`;
const p = (inner: string) => `<w:p>${inner}</w:p>`;
const img = (rid: string) => `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

export async function buildDocx(): Promise<Buffer> {
  const frac = `<m:oMath><m:f><m:num>${mr("a")}</m:num><m:den>${mr("b")}</m:den></m:f></m:oMath>`;
  const sqrt = `<m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${mr("x")}<m:r><m:t>+</m:t></m:r>${mr("1")}</m:e></m:rad></m:oMath>`;
  const sup = `<m:oMath><m:sSup><m:e>${mr("x")}</m:e><m:sup>${mr("2")}</m:sup></m:sSup>${mr("≤")}${mr("π")}</m:oMath>`;
  const integral = `<m:oMath><m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr><m:sub>${mr("0")}</m:sub><m:sup>${mr("1")}</m:sup><m:e>${mr("x")}</m:e></m:nary></m:oMath>`;
  const delim = `<m:oMath><m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:e>${mr("x")}${mr("=")}${mr("1")}</m:e><m:e>${mr("y")}${mr("=")}${mr("2")}</m:e></m:eqArr></m:e></m:d></m:oMath>`;
  const func = `<m:oMath><m:func><m:fName>${mr("sin")}</m:fName><m:e>${mr("x")}</m:e></m:func></m:oMath>`;
  const body = [
    p(t("Câu 1. Tính giá trị biểu thức ") + frac + t(" và ") + sqrt + t(".")),
    p(t("A. ") + sup + t("   B. ") + integral + t("   ") + `<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>C. đáp án gạch chân</w:t></w:r>` + t("   D. ") + func),
    p(t("Câu 2. Cho hình vẽ bên: ") + img("rId1")),
    p(t("A. ") + img("rId1") + t(" B. ") + img("rId2")),
    p(delim),
    `<w:tbl><w:tr><w:tc>${p(t("Câu"))}</w:tc><w:tc>${p(t("1"))}</w:tc><w:tc>${p(t("2"))}</w:tc></w:tr><w:tr><w:tc>${p(t("Đáp án"))}</w:tc><w:tc>${p(t("C"))}</w:tc><w:tc>${p(t("B"))}</w:tc></w:tr></w:tbl>`,
  ].join("");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}</w:body></w:document>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="media/image1.png"/><Relationship Id="rId2" Type="x" Target="media/image2.png"/></Relationships>`);
  zip.file("word/media/image1.png", tinyPng());
  zip.file("word/media/image2.png", tinyPng());
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}
