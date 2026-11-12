import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";

/** Tách văn bản thành đoạn chữ thường và đoạn công thức: $...$ (cùng dòng) hoặc $$...$$ (khối). `\$` là ký tự $ thường. */
const MATH = /(\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\\\n])+?\$)/g;

function renderTex(tex: string, display: boolean) {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", output: "html" });
}

/** Hiển thị nội dung câu hỏi: văn bản + công thức Toán/Lý/Hóa (LaTeX, hóa học dùng \ce{...}). Không dựng HTML từ văn bản người dùng nhập. */
export function MathText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(MATH);
  return (
    <span className={`whitespace-pre-line break-words ${className}`}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part.replace(/\\\$/g, "$")}</span>;
        const display = part.startsWith("$$");
        const tex = part.slice(display ? 2 : 1, display ? -2 : -1);
        return <span key={i} className={display ? "block overflow-x-auto py-1 text-center" : ""} dangerouslySetInnerHTML={{ __html: renderTex(tex, display) }} />;
      })}
    </span>
  );
}
