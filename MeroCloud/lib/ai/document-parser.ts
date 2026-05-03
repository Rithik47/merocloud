import mammoth from "mammoth";
// pdf-parse v1 ships CommonJS only with no ESM build.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
import * as XLSX from "xlsx";

const MAX_CHARS = 150_000; // ~100k tokens — safe for Gemini 1.5 Flash free tier

const truncate = (text: string) => {
  if (text.length <= MAX_CHARS) return text;
  return (
    text.slice(0, MAX_CHARS) +
    `\n\n[Document truncated — ${text.length.toLocaleString()} total characters, showing first ${MAX_CHARS.toLocaleString()}]`
  );
};

const fetchFileBuffer = async (fileUrl: string): Promise<Buffer> => {
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const extractFromPdf = async (buffer: Buffer): Promise<string> => {
  const data = await pdfParse(buffer);
  return data.text.trim();
};

const extractFromDocx = async (buffer: Buffer): Promise<string> => {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
};

const extractFromSpreadsheet = (buffer: Buffer): string => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    lines.push(`=== Sheet: ${sheetName} ===\n${csv}`);
  }

  return lines.join("\n\n").trim();
};

const extractFromRtf = (buffer: Buffer): string => {
  const raw = buffer.toString("utf-8");
  // Strip RTF control words, groups, and binary data
  return raw
    .replace(/\{[^{}]*\}/g, "")
    .replace(/\\[a-z]+\d*\s?/gi, "")
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const extractFromText = (buffer: Buffer): string => {
  return buffer.toString("utf-8").trim();
};

/**
 * Fetches a document from its URL and extracts plain text.
 * Supports: pdf, docx, doc, txt, md, html, htm, csv, xlsx, xls, ods, rtf
 */
export const extractDocumentText = async (
  fileUrl: string,
  extension: string,
): Promise<string> => {
  const ext = extension.toLowerCase().replace(".", "");
  const buffer = await fetchFileBuffer(fileUrl);

  let text: string;

  switch (ext) {
    case "pdf":
      text = await extractFromPdf(buffer);
      break;

    case "docx":
    case "doc":
      text = await extractFromDocx(buffer);
      break;

    case "xlsx":
    case "xls":
    case "ods":
      text = extractFromSpreadsheet(buffer);
      break;

    case "csv":
      text = extractFromText(buffer);
      break;

    case "rtf":
      text = extractFromRtf(buffer);
      break;

    case "txt":
    case "md":
    case "html":
    case "htm":
    case "epub":
    default:
      text = extractFromText(buffer);
      break;
  }

  if (!text) {
    throw new Error(
      "Could not extract any text from this document. The file may be empty, scanned, or password-protected.",
    );
  }

  return truncate(text);
};
