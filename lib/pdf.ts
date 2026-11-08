// Wraps one JPEG (the Download Report capture of the View tab) into a PDF, splitting a tall image across
// US Letter pages. No library: a PDF can embed JPEG data as-is (DCTDecode), so this only writes the PDF structure.

const PAGE_W = 612; // US Letter, in points
const PAGE_H = 792;
const MARGIN = 24;

/** jpeg: the image bytes; width/height: its size in pixels. Returns a PDF file as a Blob. */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Blob {
  const enc = new TextEncoder();
  const drawW = PAGE_W - 2 * MARGIN;
  const drawH = (height * drawW) / width; // the whole image scaled to the page width
  const sliceH = PAGE_H - 2 * MARGIN; // how much of it fits on one page
  const pages = Math.max(1, Math.ceil(drawH / sliceH));

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    size += bytes.length;
  };
  const object = (n: number, ...body: (string | Uint8Array)[]) => {
    offsets[n] = size;
    write(`${n} 0 obj\n`);
    body.forEach(write);
    write("\nendobj\n");
  };

  // Objects: 1 catalog, 2 page list, 3 image, then a page + its drawing instructions for each page.
  const pageObj = (i: number) => 4 + i * 2;
  write(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4 + binary marker
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${pageObj(i)} 0 R`).join(" ")}] >>`);
  object(
    3,
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  );
  for (let i = 0; i < pages; i++) {
    // Place the full image so that page i shows its i-th slice, and clip to the margins.
    const y = PAGE_H - MARGIN - drawH + i * sliceH;
    const draw = `q ${MARGIN} ${MARGIN} ${drawW} ${sliceH} re W n ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${MARGIN} ${y.toFixed(2)} cm /Im0 Do Q`;
    object(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 3 0 R >> >> /Contents ${pageObj(i) + 1} 0 R >>`);
    object(pageObj(i) + 1, `<< /Length ${enc.encode(draw).length} >>\nstream\n${draw}\nendstream`);
  }

  const count = pageObj(pages - 1) + 2;
  const xref = size;
  write(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) write(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  write(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

/** Turns a data: URL from html-to-image into bytes plus the image's pixel size. */
export async function jpegFromDataUrl(dataUrl: string): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, width: img.naturalWidth, height: img.naturalHeight };
}
