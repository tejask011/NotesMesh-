import { CanvasDocument, CanvasElement } from '../domain/canvas';
import {
  CLOUD_PATH,
  cloudScale,
  connectorPath,
  contentBounds,
  cylinderBodyPath,
  diamondPoints,
  hexagonPoints,
  readableTextColor,
} from './canvasOps';

const EXPORT_PADDING = 40;
const CHARS_PER_PIXEL = 1 / 7;
const LINE_HEIGHT = 16;

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrapText(text: string, width: number): string[] {
  const maxChars = Math.max(4, Math.floor(width * CHARS_PER_PIXEL));
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function renderText(
  el: CanvasElement,
  text: string,
  color: string,
  top: number,
  height: number
): string {
  const lines = wrapText(text, el.width - 16);
  const startY = top + height / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2 + 4;
  return lines
    .map((line, index) => {
      const y = startY + index * LINE_HEIGHT;
      return `<text x="${el.width / 2}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="${color}">${escapeXml(line)}</text>`;
    })
    .join('');
}

function renderShape(el: CanvasElement, isDarkMode: boolean): string {
  const fill = escapeXml(el.color ?? (isDarkMode ? '#1e293b' : '#ffffff'));
  const stroke = escapeXml(el.strokeColor ?? '#475569');
  const paint = `fill="${fill}" stroke="${stroke}" stroke-width="1.5"`;
  const { width, height } = el;

  switch (el.type) {
    case 'rectangle':
      return `<rect width="${width}" height="${height}" rx="10" ${paint}/>`;
    case 'diamond':
      return `<polygon points="${diamondPoints(width, height)}" ${paint}/>`;
    case 'circle':
      return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${paint}/>`;
    case 'cylinder':
      return `<path d="${cylinderBodyPath(width, height)}" ${paint}/><ellipse cx="${width / 2}" cy="16" rx="${width / 2}" ry="14" ${paint}/>`;
    case 'cloud':
      return `<path d="${CLOUD_PATH}" transform="${cloudScale(width, height)}" ${paint}/>`;
    case 'hexagon':
      return `<polygon points="${hexagonPoints(width, height)}" ${paint}/>`;
    case 'sticky':
      return `<rect width="${width}" height="${height}" rx="4" fill="${fill}" stroke="rgba(0,0,0,0.1)"/>`;
    case 'note-card':
      return (
        `<rect width="${width}" height="${height}" rx="12" fill="${isDarkMode ? '#0d121f' : '#ffffff'}" stroke="#6366f1" stroke-width="2"/>` +
        `<rect width="${width}" height="28" rx="10" fill="#6366f1"/>` +
        `<text x="12" y="18" fill="#ffffff" font-family="Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(el.linkedNoteTitle ?? 'Note')}</text>`
      );
    default:
      return '';
  }
}

function textColor(el: CanvasElement, isDarkMode: boolean): string {
  const boardText = isDarkMode ? '#f1f5f9' : '#0f172a';
  return el.type === 'note-card' ? boardText : readableTextColor(el.color, boardText);
}

/**
 * A standalone SVG built from the document rather than serialized from the live
 * DOM. It has no app classes or embedded HTML, so it renders the same anywhere,
 * covers the whole board instead of the current viewport, and can be drawn to a
 * <canvas> for PNG export without tainting it.
 */
export function canvasToSvg(doc: CanvasDocument, isDarkMode: boolean): string {
  const bounds = contentBounds(doc.elements, EXPORT_PADDING);
  const background = isDarkMode ? '#070a12' : '#f8fafc';
  const lineColor = isDarkMode ? '#818cf8' : '#4f46e5';

  const connectors = doc.elements
    .filter(el => el.type === 'connector')
    .map(el => {
      const dash = el.connectorStyle === 'dashed' ? ' stroke-dasharray="6,4"' : '';
      const head = el.arrowHeadType === 'none' ? '' : ' marker-end="url(#arrowhead)"';
      const tail = el.arrowHeadType === 'both' ? ' marker-start="url(#arrowhead-start)"' : '';
      return `<path d="${connectorPath(el)}" fill="none" stroke="${lineColor}" stroke-width="2"${dash}${head}${tail}/>`;
    })
    .join('');

  const shapes = doc.elements
    .filter(el => el.type !== 'connector')
    .map(el => {
      const isCard = el.type === 'note-card';
      const top = isCard ? 28 : 0;
      const text = el.text
        ? renderText(el, el.text, textColor(el, isDarkMode), top, el.height - top)
        : '';
      return `<g transform="translate(${el.x}, ${el.y})">${renderShape(el, isDarkMode)}${text}</g>`;
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" ` +
    `viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">` +
    `<title>${escapeXml(doc.title)}</title>` +
    `<defs>` +
    `<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${lineColor}"/></marker>` +
    `<marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto"><polygon points="10 0, 0 3.5, 10 7" fill="${lineColor}"/></marker>` +
    `</defs>` +
    `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${background}"/>` +
    connectors +
    shapes +
    `</svg>`
  );
}

/** Rasterize at 2x for crisp output. Browsers cap canvas size, so very large boards scale down. */
export function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(2, 8192 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not create an image of this board.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Could not create an image of this board.'));
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not create an image of this board.'));
    };
    image.src = url;
  });
}

export function canvasExportSize(doc: CanvasDocument): { width: number; height: number } {
  const { width, height } = contentBounds(doc.elements, EXPORT_PADDING);
  return { width, height };
}
