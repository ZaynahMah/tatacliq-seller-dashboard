/**
 * Image enhancement v2 — preserves subject pixels, no blur, no white pad.
 *
 * Two engines:
 *   1. Gemini 2.5 Flash Image (Nano Banana) — real generative outpainting.
 *      Used when GEMINI_API_KEY is set. We send the original image + a
 *      detailed prompt anchored to the chosen enhancement mode.
 *
 *   2. Sharp edge-extension fallback — used when no key is available.
 *      Critically, this fallback NEVER blurs or re-encodes the subject:
 *        - subject is composited at its native resolution + sharpness
 *        - new padded space is filled by stretching a 1-pixel edge strip
 *          (mirrors what Photoshop's "Content-Aware Edge Extend" does for
 *          plain backgrounds, looks far better than gaussian blur)
 *        - if the source is a studio shot (uniform edges), the result is
 *          indistinguishable from the original being on a larger canvas
 *
 * Either engine returns the same shape so the UI doesn't care which ran.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

export type EnhanceMode =
  | 'smart_fit'             // Extend background naturally
  | 'extend_background'     // Same scene, more visible environment
  | 'white_studio'          // Soft white studio gradient
  | 'marketplace_portrait'  // Clean Myntra/Ajio-style portrait
  | 'pure_white'            // Pure #FFFFFF marketplace background
  | 'pure_black';           // Pure #000000 editorial background

export interface EnhanceOptions {
  imageBuffer: Buffer;
  imageMime: string;
  targetWidth: number;
  targetHeight: number;
  mode: EnhanceMode;
  productContext?: string;
}

export interface EnhanceResult {
  enhancedBuffer: Buffer;
  enhancedMime: string;
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
  subjectBox: { x: number; y: number; w: number; h: number };
  cropRisk: { head: number; hands: number; feet: number; garment: number };
  engine: 'gemini' | 'sharp-fallback';
  mode: EnhanceMode;
  notes: string[];
  /** Token usage for cost accounting */
  usage?: {
    inputImageTokens: number;
    outputImageTokens: number;
    estimatedCostUsd: number;
  };
}

// Mode-specific prompt fragments fed to Gemini
const MODE_PROMPTS: Record<EnhanceMode, string> = {
  smart_fit: `Extend the image naturally to the new aspect ratio. Match the
existing background tone, lighting, and texture. Result must look like a
single seamless photograph, never a composite.`,

  extend_background: `Show more of the existing environment around the subject.
Continue the same studio/location naturally — same floor, same wall, same
lighting direction. Add believable depth and surrounding space.`,

  white_studio: `Replace the background entirely with a clean, professional
white studio backdrop. Soft seamless gradient from pure white at top to
very light grey near the bottom. Add a subtle natural floor shadow under
the subject. No harsh edges. Premium e-commerce look.`,

  marketplace_portrait: `Compose as a premium marketplace product portrait
suitable for Myntra, Ajio, or Amazon Fashion. Clean neutral backdrop in a
soft warm tone, generous symmetric space around the subject, subtle natural
shadow, no distractions. The garment must be the clear hero of the frame.`,

  pure_white: `Replace the background entirely with absolutely pure white
(#FFFFFF). Cut out the subject cleanly with hair-perfect edges. Keep the
subject identical — same pose, same proportions, same garment details. Add
only a very faint natural floor shadow. No gradient. No texture. No tint.
This is a marketplace-cutout look used by Myntra and Amazon Fashion.`,

  pure_black: `Replace the background entirely with absolutely pure black
(#000000). Cut out the subject cleanly with hair-perfect edges. Keep the
subject identical — same pose, same proportions, same garment details. No
gradient. No texture. No glow. Premium editorial look used by luxury fashion
e-commerce.`,
};

const BASE_RULES = `
You are a fashion e-commerce image editor.

ABSOLUTE RULES — these are non-negotiable:
- Preserve the subject (model, garment, accessories) at 100% fidelity
- Do NOT crop the head, hair, hands, fingers, feet, garment edges, or accessories
- Do NOT add flat white or solid color padding rectangles
- Do NOT distort, stretch, squash, or change the subject's proportions
- Do NOT regenerate the model's face — keep it pixel-perfect
- Preserve all garment details: stitching, prints, buttons, fabric texture
- Output must be sharp, never blurry
- Match lighting direction and color temperature of the source

OUTPUT STYLE:
- Premium fashion e-commerce photography
- Sharpness and contrast match a Myntra/Ajio/Amazon Fashion product shot
`.trim();

// ===========================================================================
// Pricing constants (Gemini 2.5 Flash Image, May 2026)
// Input image: ~1290 tokens, Output image: ~1290 tokens per ≤1024×1024
// Output token price: $30/M  →  $0.039 per output image
// Input token price (multimodal flash): $0.30/M
// ===========================================================================
const GEMINI_OUTPUT_PRICE_PER_M = 30.0; // USD per 1M output tokens
const GEMINI_INPUT_PRICE_PER_M = 0.30; // USD per 1M input tokens
const TOKENS_PER_IMAGE = 1290;

export function estimateGeminiImageCost(numInputImages = 1, numOutputImages = 1) {
  const inputTokens = numInputImages * TOKENS_PER_IMAGE;
  const outputTokens = numOutputImages * TOKENS_PER_IMAGE;
  const cost =
    (inputTokens * GEMINI_INPUT_PRICE_PER_M) / 1_000_000 +
    (outputTokens * GEMINI_OUTPUT_PRICE_PER_M) / 1_000_000;
  return { inputTokens, outputTokens, cost };
}

// ===========================================================================
// Entry point
// ===========================================================================

export async function enhanceImage(opts: EnhanceOptions): Promise<EnhanceResult> {
  const meta = await sharp(opts.imageBuffer).metadata();
  const ow = meta.width ?? opts.targetWidth;
  const oh = meta.height ?? opts.targetHeight;

  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await runGemini(opts, ow, oh);
      if (result) return result;
    } catch (err: any) {
      console.warn('[enhance] Gemini failed, using fallback:', err.message);
    }
  }
  return runSharp(opts, ow, oh);
}

// ===========================================================================
// Engine 1: Gemini Nano Banana
// ===========================================================================

async function runGemini(
  opts: EnhanceOptions,
  ow: number,
  oh: number,
): Promise<EnhanceResult | null> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

  const aspect = formatAspect(opts.targetWidth, opts.targetHeight);
  const modePrompt = MODE_PROMPTS[opts.mode];
  const isResize = opts.targetWidth !== ow || opts.targetHeight !== oh;
  const isBackgroundOnlyMode = opts.mode === 'pure_white' || opts.mode === 'pure_black';

  // Background-only modes ("Make Background White/Black") get an unambiguous
  // task framing: change ONLY the background, leave everything else —
  // including the canvas size — untouched. Mixing this with "reframe to a
  // new aspect ratio" language (which applied to every mode previously,
  // even when no resize was requested) made it easy for the model to treat
  // the background swap as license to also reposition or recrop the
  // subject. Resize-driven modes (smart_fit, extend_background) keep the
  // aspect-ratio framing since that's actually their job.
  const taskLine = isBackgroundOnlyMode && !isResize
    ? `TASK: Change ONLY the background of this fashion product photo. The product, the model or mannequin, their pose, framing, and the canvas dimensions (${ow} × ${oh} pixels) must remain completely unchanged — pixel-identical except for the background itself.`
    : `TASK: Reframe this fashion product photo to a ${aspect} aspect ratio (${opts.targetWidth} × ${opts.targetHeight} pixels).`;

  const prompt = `${BASE_RULES}

${taskLine}

ENHANCEMENT MODE: ${opts.mode.replace('_', ' ').toUpperCase()}
${modePrompt}
${isBackgroundOnlyMode ? '\nCRITICAL: Do not move, resize, recrop, or reposition the subject. Do not change the canvas dimensions. The ONLY change permitted is the background.' : ''}

${opts.productContext ? `PRODUCT CONTEXT: ${opts.productContext}` : ''}

Generate the final image. Do not return text.`.trim();

  const response = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        data: opts.imageBuffer.toString('base64'),
        mimeType: opts.imageMime,
      },
    },
  ]);

  const parts = response.response?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = (p as any).inlineData;
    if (inline?.data) {
      const buf = Buffer.from(inline.data, 'base64');

      // Resize ONLY if the model didn't return our exact size. Use "cover"
      // here is wrong because it can crop — use a final composite onto the
      // exact target canvas at native resolution.
      const final = await fitWithoutCrop(buf, opts.targetWidth, opts.targetHeight);

      const placement = computePlacement(ow, oh, opts.targetWidth, opts.targetHeight);

      const { inputTokens, outputTokens, cost } = estimateGeminiImageCost(1, 1);

      return {
        enhancedBuffer: final,
        enhancedMime: 'image/jpeg',
        originalWidth: ow,
        originalHeight: oh,
        targetWidth: opts.targetWidth,
        targetHeight: opts.targetHeight,
        subjectBox: placement,
        cropRisk: cropRiskFromPlacement(placement, opts.targetWidth, opts.targetHeight, ow, oh),
        engine: 'gemini',
        mode: opts.mode,
        notes: [
          `Outpainted with Gemini 2.5 Flash Image (Nano Banana) — ${opts.mode.replace('_', ' ')} mode`,
        ],
        usage: {
          inputImageTokens: inputTokens,
          outputImageTokens: outputTokens,
          estimatedCostUsd: cost,
        },
      };
    }
  }
  return null;
}

/**
 * If Gemini returned a different aspect, place it on the exact target canvas
 * with edge-extension padding. Never crops, never blurs.
 */
async function fitWithoutCrop(buf: Buffer, tw: number, th: number): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? tw;
  const h = meta.height ?? th;
  if (w === tw && h === th) {
    return sharp(buf).jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  }
  // Scale to fit, then edge-extend the remaining canvas
  const scale = Math.min(tw / w, th / h);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);
  const resized = await sharp(buf).resize(sw, sh, { kernel: 'lanczos3' }).toBuffer();
  return composeOnExtendedCanvas(resized, sw, sh, tw, th);
}

// ===========================================================================
// Engine 2: Sharp fallback — preserves subject pixel-perfect
// ===========================================================================

async function runSharp(
  opts: EnhanceOptions,
  ow: number,
  oh: number,
): Promise<EnhanceResult> {
  const { imageBuffer, targetWidth, targetHeight, mode } = opts;

  // Subject scale: fit within target with 6% safe margin
  const margin = 0.08;
  const maxW = Math.floor(targetWidth * (1 - margin * 2));
  const maxH = Math.floor(targetHeight * (1 - margin * 2));
  const scale = Math.min(maxW / ow, maxH / oh, 1); // never upscale beyond 1.0
  const sw = Math.max(1, Math.round(ow * scale));
  const sh = Math.max(1, Math.round(oh * scale));

  // Subject at full native sharpness — no blur, no re-encoding chains
  const subject = await sharp(imageBuffer)
    .resize(sw, sh, { kernel: 'lanczos3', fit: 'inside' })
    .toBuffer();

  // Build the background canvas based on mode
  let canvas: Buffer;
  if (mode === 'pure_white') {
    canvas = await pureColorCanvas(targetWidth, targetHeight, 255, 255, 255);
  } else if (mode === 'pure_black') {
    canvas = await pureColorCanvas(targetWidth, targetHeight, 0, 0, 0);
  } else if (mode === 'white_studio') {
    canvas = await whiteStudioCanvas(targetWidth, targetHeight);
  } else if (mode === 'marketplace_portrait') {
    canvas = await neutralWarmCanvas(targetWidth, targetHeight);
  } else {
    // smart_fit + extend_background — edge-extend from the original
    canvas = await edgeExtendCanvas(imageBuffer, targetWidth, targetHeight);
  }

  const placement = computePlacement(sw, sh, targetWidth, targetHeight);

  const composed = await sharp(canvas)
    .composite([{ input: subject, left: placement.x, top: placement.y }])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();

  // Add a subtle soft shadow under the subject for studio modes
  const finalBuffer =
    mode === 'white_studio' || mode === 'marketplace_portrait' || mode === 'pure_white'
      ? await addFloorShadow(composed, placement, targetWidth, targetHeight)
      : composed;

  return {
    enhancedBuffer: finalBuffer,
    enhancedMime: 'image/jpeg',
    originalWidth: ow,
    originalHeight: oh,
    targetWidth,
    targetHeight,
    subjectBox: { x: placement.x, y: placement.y, w: sw, h: sh },
    cropRisk: cropRiskFromPlacement(
      { x: placement.x, y: placement.y, w: sw, h: sh },
      targetWidth,
      targetHeight,
      ow,
      oh,
    ),
    engine: 'sharp-fallback',
    mode,
    notes: [
      mode === 'pure_white'
        ? 'Pure #FFFFFF background — marketplace cutout look with soft floor shadow'
        : mode === 'pure_black'
          ? 'Pure #000000 background — editorial cutout look'
          : mode === 'white_studio'
            ? 'Soft white studio gradient backdrop'
            : mode === 'marketplace_portrait'
              ? 'Neutral warm portrait canvas, marketplace-ready composition'
              : 'Edge-extended canvas — sampled the actual edge pixels of your photo',
      'Subject pasted at native sharpness — zero blur, zero re-encoding',
      (mode === 'pure_white' || mode === 'pure_black')
        ? 'For perfect hair-edge cutouts, set GEMINI_API_KEY (uses Gemini 2.5 Flash Image)'
        : 'For generative background replacement, set GEMINI_API_KEY',
    ],
  };
}

/**
 * Edge-extension: take the 4 edge strips of the source image, stretch each
 * one across the corresponding padding area. This is what photo editors do
 * for plain backdrops — it preserves color, tone, and noise without blur.
 */
async function edgeExtendCanvas(src: Buffer, tw: number, th: number): Promise<Buffer> {
  const meta = await sharp(src).metadata();
  const w = meta.width ?? tw;
  const h = meta.height ?? th;

  // Take a 32-px edge strip from each side
  const strip = 32;

  // Sample the avg edge color — this is our base canvas
  const stats = await sharp(src)
    .extract({ left: 0, top: 0, width: w, height: strip })
    .stats();
  const dom = stats.channels.map((c) => Math.round(c.mean));
  const baseR = dom[0] ?? 240;
  const baseG = dom[1] ?? 240;
  const baseB = dom[2] ?? 240;

  // Create base canvas filled with averaged edge color
  let canvas = await sharp({
    create: {
      width: tw,
      height: th,
      channels: 3,
      background: { r: baseR, g: baseG, b: baseB },
    },
  })
    .jpeg()
    .toBuffer();

  // Stretch the top/bottom/left/right edge strips into the padding zones
  const scale = Math.min((tw * 0.92) / w, (th * 0.92) / h, 1);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);
  const x = Math.floor((tw - sw) / 2);
  const y = Math.floor((th - sh) / 2);

  // Top strip stretched
  if (y > 0) {
    const topStrip = await sharp(src)
      .extract({ left: 0, top: 0, width: w, height: Math.min(strip, h) })
      .resize(sw, y, { fit: 'fill', kernel: 'lanczos3' })
      .blur(2)
      .toBuffer();
    canvas = await sharp(canvas)
      .composite([{ input: topStrip, left: x, top: 0 }])
      .toBuffer();
  }
  // Bottom strip
  if (y + sh < th) {
    const bottomStrip = await sharp(src)
      .extract({ left: 0, top: Math.max(0, h - strip), width: w, height: Math.min(strip, h) })
      .resize(sw, th - (y + sh), { fit: 'fill', kernel: 'lanczos3' })
      .blur(2)
      .toBuffer();
    canvas = await sharp(canvas)
      .composite([{ input: bottomStrip, left: x, top: y + sh }])
      .toBuffer();
  }
  // Left strip
  if (x > 0) {
    const leftStrip = await sharp(src)
      .extract({ left: 0, top: 0, width: Math.min(strip, w), height: h })
      .resize(x, th, { fit: 'fill', kernel: 'lanczos3' })
      .blur(2)
      .toBuffer();
    canvas = await sharp(canvas)
      .composite([{ input: leftStrip, left: 0, top: 0 }])
      .toBuffer();
  }
  // Right strip
  if (x + sw < tw) {
    const rightStrip = await sharp(src)
      .extract({ left: Math.max(0, w - strip), top: 0, width: Math.min(strip, w), height: h })
      .resize(tw - (x + sw), th, { fit: 'fill', kernel: 'lanczos3' })
      .blur(2)
      .toBuffer();
    canvas = await sharp(canvas)
      .composite([{ input: rightStrip, left: x + sw, top: 0 }])
      .toBuffer();
  }

  return canvas;
}

async function pureColorCanvas(tw: number, th: number, r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: {
      width: tw,
      height: th,
      channels: 3,
      background: { r, g, b },
    },
  })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();
}

async function whiteStudioCanvas(tw: number, th: number): Promise<Buffer> {
  // Soft top-to-bottom gradient white → light grey
  const svg = `
    <svg width="${tw}" height="${th}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="70%" stop-color="#fafafa"/>
          <stop offset="100%" stop-color="#eaeaea"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 94 }).toBuffer();
}

async function neutralWarmCanvas(tw: number, th: number): Promise<Buffer> {
  const svg = `
    <svg width="${tw}" height="${th}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#f6efe4"/>
          <stop offset="60%" stop-color="#ede1ce"/>
          <stop offset="100%" stop-color="#d8c8ae"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 94 }).toBuffer();
}

async function addFloorShadow(
  canvas: Buffer,
  placement: { x: number; y: number; w: number; h: number },
  tw: number,
  th: number,
): Promise<Buffer> {
  const shadowW = Math.round(placement.w * 1.2);
  const shadowH = 30;
  const shadowX = Math.round(placement.x + placement.w / 2 - shadowW / 2);
  const shadowY = Math.min(th - shadowH, placement.y + placement.h - 10);

  const shadowSvg = `
    <svg width="${shadowW}" height="${shadowH}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${shadowW / 2}" cy="${shadowH / 2}" rx="${shadowW / 2 - 6}" ry="${shadowH / 2 - 2}"
        fill="rgba(0,0,0,0.16)" filter="blur(6)"/>
    </svg>`;
  const shadow = await sharp(Buffer.from(shadowSvg)).png().toBuffer();
  return sharp(canvas)
    .composite([{ input: shadow, left: shadowX, top: shadowY, blend: 'multiply' }])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
}

// ===========================================================================
// Geometry helpers
// ===========================================================================

async function composeOnExtendedCanvas(
  subject: Buffer,
  sw: number,
  sh: number,
  tw: number,
  th: number,
): Promise<Buffer> {
  const canvas = await edgeExtendCanvas(subject, tw, th);
  const x = Math.floor((tw - sw) / 2);
  const y = Math.floor((th - sh) / 2);
  return sharp(canvas)
    .composite([{ input: subject, left: x, top: y }])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
}

function computePlacement(ow: number, oh: number, tw: number, th: number) {
  const margin = 0.08;
  const maxW = Math.floor(tw * (1 - margin * 2));
  const maxH = Math.floor(th * (1 - margin * 2));
  const scale = Math.min(maxW / ow, maxH / oh, 1);
  const w = Math.round(ow * scale);
  const h = Math.round(oh * scale);
  return { x: Math.floor((tw - w) / 2), y: Math.floor((th - h) / 2), w, h };
}

function cropRiskFromPlacement(
  box: { x: number; y: number; w: number; h: number },
  tw: number,
  th: number,
  ow: number,
  oh: number,
) {
  const topRoom = box.y / th;
  const bottomRoom = (th - (box.y + box.h)) / th;
  const sideRoom = Math.min(box.x, tw - (box.x + box.w)) / tw;
  const origAspect = ow / oh;
  const newAspect = tw / th;
  const aspectShift = Math.abs(Math.log(origAspect / newAspect));
  const subjectAreaRatio = (box.w * box.h) / (tw * th);
  return {
    head: round2(clamp01(0.4 - topRoom * 2 + aspectShift * 0.3)),
    feet: round2(clamp01(0.4 - bottomRoom * 2 + aspectShift * 0.3)),
    hands: round2(clamp01(0.3 - sideRoom * 2 + aspectShift * 0.2)),
    garment: round2(clamp01(0.6 - subjectAreaRatio)),
  };
}

function formatAspect(w: number, h: number): string {
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
