import { cpSync } from 'node:fs';

const dateien = {
  'legacy/build/pdf.mjs': 'pdf.mjs',
  'legacy/build/pdf.worker.mjs': 'pdf.worker.mjs',
  'legacy/web/pdf_viewer.mjs': 'pdf_viewer.mjs',
  'legacy/web/pdf_viewer.css': 'pdf_viewer.css',
  'legacy/web/images': 'images',
  'standard_fonts': 'standard_fonts',
  'cmaps': 'cmaps',
  'wasm': 'wasm',
};

for (const [quelle, ziel] of Object.entries(dateien)) {
  cpSync(`node_modules/pdfjs-dist/${quelle}`, `media/pdfjs/${ziel}`, { recursive: true });
}
console.log('PDF.js nach media/pdfjs kopiert.');