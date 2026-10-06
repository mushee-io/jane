import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";

export interface DocumentExtractRequest {
  filename?: string;
  mimeType?: string;
  dataBase64?: string;
  text?: string;
  maxChars?: number;
}

export interface DocumentExtractResult {
  filename: string;
  mimeType: string;
  format: string;
  text: string;
  originalChars: number;
  returnedChars: number;
  truncated: boolean;
  warnings: string[];
}

function cleanText(input: string): string {
  return input
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function extension(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export class JaneDocumentService {
  async extract(request: DocumentExtractRequest): Promise<DocumentExtractResult> {
    const filename = request.filename?.trim() || "document";
    const mimeType = request.mimeType?.trim() || "application/octet-stream";
    const ext = extension(filename);
    const maxChars = Math.min(2_000_000, Math.max(1_000, request.maxChars ?? 250_000));
    const warnings: string[] = [];

    let rawText = request.text ?? "";
    let format = ext || mimeType;

    if (!rawText && request.dataBase64) {
      const bytes = Buffer.from(request.dataBase64, "base64");

      if (mimeType === "application/pdf" || ext === "pdf") {
        const parser = new PDFParse({ data: bytes });
        try {
          const result = await parser.getText();
          rawText = result.text ?? "";
          format = "pdf";
        } finally {
          await parser.destroy();
        }
      } else if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        || ext === "docx"
      ) {
        const result = await mammoth.extractRawText({ buffer: bytes });
        rawText = result.value ?? "";
        format = "docx";
        warnings.push(...result.messages.map((message) => message.message));
      } else if (
        mimeType.startsWith("text/")
        || ["txt","md","csv","json","html","css","js","ts","py","xml","yaml","yml"].includes(ext)
      ) {
        rawText = bytes.toString("utf8");
        format = ext || "text";
      } else {
        throw new Error("UNSUPPORTED_DOCUMENT_TYPE");
      }
    }

    if (!rawText) throw new Error("DOCUMENT_CONTENT_REQUIRED");

    const cleaned = cleanText(rawText);
    const originalChars = cleaned.length;
    const text = cleaned.slice(0, maxChars);

    return {
      filename,
      mimeType,
      format,
      text,
      originalChars,
      returnedChars: text.length,
      truncated: originalChars > text.length,
      warnings
    };
  }
}
