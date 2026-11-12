/** Đổi công thức Word (OMML) sang LaTeX. Chạy trên cây xml2js (explicitChildren + preserveChildrenOrder). */

export type XmlNode = { "#name": string; $?: Record<string, string>; $$?: XmlNode[]; _?: string };

export const nameOf = (n: XmlNode) => n["#name"];
export const kidsOf = (n: XmlNode | undefined): XmlNode[] => n?.$$ ?? [];
export const child = (n: XmlNode | undefined, name: string) => kidsOf(n).find((k) => nameOf(k) === name);
export const attrOf = (n: XmlNode | undefined, name: string) => n?.$?.[name];
export const textOf = (n: XmlNode | undefined): string => (n ? (nameOf(n) === "__text__" ? (n._ ?? "") : kidsOf(n).map(textOf).join("")) : "");

const SYMBOLS: Record<string, string> = {
  "×": "\\times ", "÷": "\\div ", "·": "\\cdot ", "⋅": "\\cdot ", "∙": "\\cdot ", "−": "-", "±": "\\pm ", "∓": "\\mp ", "≤": "\\leq ", "≥": "\\geq ", "≠": "\\neq ", "≈": "\\approx ",
  "≡": "\\equiv ", "∞": "\\infty ", "∈": "\\in ", "∉": "\\notin ", "⊂": "\\subset ", "⊃": "\\supset ", "⊆": "\\subseteq ", "∪": "\\cup ", "∩": "\\cap ", "∅": "\\emptyset ",
  "→": "\\rightarrow ", "←": "\\leftarrow ", "↔": "\\leftrightarrow ", "⇒": "\\Rightarrow ", "⇔": "\\Leftrightarrow ", "⇌": "\\rightleftharpoons ", "∀": "\\forall ", "∃": "\\exists ",
  "∂": "\\partial ", "∇": "\\nabla ", "°": "^\\circ ", "′": "'", "″": "''", "∠": "\\angle ", "⊥": "\\perp ", "∥": "\\parallel ", "∼": "\\sim ", "∝": "\\propto ", "…": "\\ldots ",
  "α": "\\alpha ", "β": "\\beta ", "γ": "\\gamma ", "δ": "\\delta ", "ε": "\\varepsilon ", "ϵ": "\\epsilon ", "ζ": "\\zeta ", "η": "\\eta ", "θ": "\\theta ", "ϑ": "\\vartheta ", "ι": "\\iota ", "κ": "\\kappa ",
  "λ": "\\lambda ", "μ": "\\mu ", "ν": "\\nu ", "ξ": "\\xi ", "π": "\\pi ", "ρ": "\\rho ", "σ": "\\sigma ", "τ": "\\tau ", "υ": "\\upsilon ", "φ": "\\varphi ", "ϕ": "\\phi ", "χ": "\\chi ", "ψ": "\\psi ", "ω": "\\omega ",
  "Γ": "\\Gamma ", "Δ": "\\Delta ", "Θ": "\\Theta ", "Λ": "\\Lambda ", "Ξ": "\\Xi ", "Π": "\\Pi ", "Σ": "\\Sigma ", "Φ": "\\Phi ", "Ψ": "\\Psi ", "Ω": "\\Omega ",
  "%": "\\%", "#": "\\#", "&": "\\&", "$": "\\$", "_": "\\_", "{": "\\{", "}": "\\}", " ": "\\ ",
};
const mapText = (t: string) => [...t].map((c) => SYMBOLS[c] ?? c).join("");

const NARY: Record<string, string> = { "∑": "\\sum", "∏": "\\prod", "∐": "\\coprod", "∫": "\\int", "∬": "\\iint", "∭": "\\iiint", "∮": "\\oint", "⋃": "\\bigcup", "⋂": "\\bigcap", "⋁": "\\bigvee", "⋀": "\\bigwedge" };
const FUNCS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "log", "ln", "lg", "exp", "lim", "max", "min", "det", "gcd", "sup", "inf", "arg", "deg", "dim", "ker"]);
const ACCENT: Record<string, string> = { "̂": "\\hat", "^": "\\hat", "̃": "\\tilde", "~": "\\tilde", "̄": "\\bar", "¯": "\\bar", "̇": "\\dot", "˙": "\\dot", "̈": "\\ddot", "⃗": "\\vec", "→": "\\vec", "⃑": "\\vec", "̌": "\\check", "̆": "\\breve" };
const DELIM: Record<string, string> = { "(": "(", ")": ")", "[": "[", "]": "]", "{": "\\{", "}": "\\}", "|": "|", "‖": "\\|", "⟨": "\\langle", "⟩": "\\rangle", "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil", "⌉": "\\rceil", "": "." };

const isOn = (v: string | undefined) => v === "1" || v === "true" || v === "on";
const group = (s: string) => `{${s.trim()}}`;
/** Cơ số của mũ/chỉ số: một ký tự thì không cần ngoặc nhọn. */
const base = (s: string) => (/^[A-Za-z0-9]$/.test(s.trim()) ? s.trim() : group(s));

function seq(nodes: XmlNode[]): string {
  return nodes.filter((n) => !nameOf(n).endsWith("Pr")).map(conv).join("");
}
const arg = (n: XmlNode, name: string) => seq(kidsOf(child(n, name)));

function run(n: XmlNode): string {
  const rPr = child(n, "m:rPr");
  const text = kidsOf(n).filter((k) => nameOf(k) === "m:t").map(textOf).join("");
  if (!text) return "";
  if (isOn(attrOf(child(rPr, "m:nor"), "m:val"))) return `\\text{${text.replace(/[\\{}$%#&_^~]/g, (c) => `\\${c}`)}}`;
  const plain = attrOf(child(rPr, "m:sty"), "m:val") === "p";
  const mapped = mapText(text);
  return plain && /^[A-Za-z]{2,}$/.test(text) ? `\\mathrm{${text}}` : mapped;
}

function delimited(n: XmlNode): string {
  const pr = child(n, "m:dPr");
  const chr = (name: string, def: string) => {
    const node = child(pr, name);
    return node ? (attrOf(node, "m:val") ?? def) : def;
  };
  const beg = chr("m:begChr", "("), end = chr("m:endChr", ")"), sep = chr("m:sepChr", "|");
  const parts = kidsOf(n).filter((k) => nameOf(k) === "m:e").map((e) => seq(kidsOf(e)));
  const mapDelim = (c: string) => DELIM[c] ?? c;
  return `\\left${mapDelim(beg)} ${parts.join(` ${DELIM[sep] ?? sep} `)} \\right${mapDelim(end)}`;
}

function conv(n: XmlNode): string {
  switch (nameOf(n)) {
    case "m:r": return run(n);
    case "m:t": return mapText(textOf(n));
    case "m:f": {
      const type = attrOf(child(child(n, "m:fPr"), "m:type"), "m:val");
      const [a, b] = [arg(n, "m:num"), arg(n, "m:den")];
      return type === "noBar" ? `\\binom${group(a)}${group(b)}` : `\\frac${group(a)}${group(b)}`;
    }
    case "m:rad": {
      const deg = arg(n, "m:deg").trim();
      const hidden = isOn(attrOf(child(child(n, "m:radPr"), "m:degHide"), "m:val"));
      return deg && !hidden ? `\\sqrt[${deg}]${group(arg(n, "m:e"))}` : `\\sqrt${group(arg(n, "m:e"))}`;
    }
    case "m:sSup": return `${base(arg(n, "m:e"))}^${group(arg(n, "m:sup"))}`;
    case "m:sSub": return `${base(arg(n, "m:e"))}_${group(arg(n, "m:sub"))}`;
    case "m:sSubSup": return `${base(arg(n, "m:e"))}_${group(arg(n, "m:sub"))}^${group(arg(n, "m:sup"))}`;
    case "m:sPre": return `{}_${group(arg(n, "m:sub"))}^${group(arg(n, "m:sup"))}${group(arg(n, "m:e"))}`;
    case "m:nary": {
      const pr = child(n, "m:naryPr");
      const c = attrOf(child(pr, "m:chr"), "m:val");
      const op = c === undefined ? "\\int" : (NARY[c] ?? "\\int");
      const sub = isOn(attrOf(child(pr, "m:subHide"), "m:val")) ? "" : arg(n, "m:sub").trim();
      const sup = isOn(attrOf(child(pr, "m:supHide"), "m:val")) ? "" : arg(n, "m:sup").trim();
      return `${op}${sub ? `_${group(sub)}` : ""}${sup ? `^${group(sup)}` : ""} ${arg(n, "m:e")}`;
    }
    case "m:d": return delimited(n);
    case "m:func": {
      const fname = arg(n, "m:fName").trim();
      const plain = textOf(child(n, "m:fName")).trim();
      const op = FUNCS.has(plain) ? `\\${plain}` : fname.startsWith("\\") || /[_^]/.test(fname) ? fname : `\\operatorname{${plain || fname}}`;
      return `${op} ${arg(n, "m:e")}`;
    }
    case "m:acc": {
      const c = attrOf(child(child(n, "m:accPr"), "m:chr"), "m:val") ?? "̂";
      return `${ACCENT[c] ?? "\\hat"}${group(arg(n, "m:e"))}`;
    }
    case "m:bar": return attrOf(child(child(n, "m:barPr"), "m:pos"), "m:val") === "bot" ? `\\underline${group(arg(n, "m:e"))}` : `\\overline${group(arg(n, "m:e"))}`;
    case "m:limLow": case "m:limUpp": {
      const base = arg(n, "m:e").trim(), lim = arg(n, "m:lim").trim();
      const low = nameOf(n) === "m:limLow";
      const word = textOf(child(n, "m:e")).trim();
      if (low && FUNCS.has(word)) return `\\${word}_${group(lim)}`;
      return `${low ? "\\underset" : "\\overset"}${group(lim)}${group(base)}`;
    }
    case "m:groupChr": return arg(n, "m:e");
    case "m:eqArr": return `\\begin{aligned} ${kidsOf(n).filter((k) => nameOf(k) === "m:e").map((e) => seq(kidsOf(e))).join(" \\\\ ")} \\end{aligned}`;
    case "m:m": return `\\begin{matrix} ${kidsOf(n).filter((k) => nameOf(k) === "m:mr").map((r) => kidsOf(r).filter((k) => nameOf(k) === "m:e").map((e) => seq(kidsOf(e))).join(" & ")).join(" \\\\ ")} \\end{matrix}`;
    case "m:box": case "m:borderBox": case "m:phant": return arg(n, "m:e");
    case "m:oMath": case "m:e": case "m:num": case "m:den": case "m:sub": case "m:sup": case "m:deg": case "m:lim": case "m:fName": return seq(kidsOf(n));
    default: return seq(kidsOf(n));
  }
}

/** Một công thức (m:oMath) -> LaTeX, không kèm dấu $. */
export function ommlToLatex(oMath: XmlNode): string {
  return conv(oMath).replace(/\s+/g, " ").replace(/\s*([{}^_])\s*/g, "$1").trim();
}
