import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract plain text from an uploaded resume. Supports PDF (via unpdf) and
 * plain text. DOCX is accepted as a best-effort raw decode; for production a
 * dedicated DOCX parser can be added behind this same interface.
 */
export async function extractResumeText(
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  if (contentType === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim();
  }

  if (contentType.startsWith("text/")) {
    return new TextDecoder().decode(bytes).trim();
  }

  // Fallback: attempt a UTF-8 decode (covers many .txt/.md uploads sent with
  // a generic content type). Reject binary blobs we can't read.
  const decoded = new TextDecoder().decode(bytes).trim();
  if (decoded.replace(/[^\x20-\x7E\s]/g, "").length < decoded.length * 0.7) {
    throw new Error(
      `Unsupported resume format: ${contentType}. Upload a PDF or plain text.`,
    );
  }
  return decoded;
}
