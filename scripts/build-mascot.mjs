/**
 * Turns the generated mascot artwork into shippable sprites.
 *
 * The sources in `assets/mascot/` are 1024px-plus PNGs straight out of an image model, ~1.2 MB
 * each. They are kept out of `public/` deliberately: anything under `public/` is copied verbatim
 * into the deployed site, so leaving them there shipped nine megabytes of source art to every
 * reader for the sake of a 100px mascot. This script is the only thing that writes
 * `public/mascot/`, and it writes WebP.
 *
 * Three transformations, in order, and each exists because the artwork needs it:
 *
 * 1. Key. A model asked for a transparent background returns one about half the time; the rest
 *    come back matted on black. The art is light on dark, so luminance *is* coverage: alpha is
 *    max(r,g,b) and the colour is un-premultiplied back out of it. Nothing here can key art that
 *    was matted on white, and nothing should try — see the glow gate below.
 *
 * 2. Normalise. Poses are swapped into a single slot, so any drift in how large the character is
 *    drawn reads as the character changing size between one answer and the next. Every pose is
 *    trimmed to its own ink and rescaled to a common content height, which removes drift in the
 *    generated framing. It cannot remove drift in the *drawing* — a pose drawn with a bigger head
 *    is still a pose with a bigger head, and `POSES[].scale` is the manual escape hatch for that.
 *
 * 3. Seat. Every sprite lands on one canvas size, bottom-aligned, so the feet sit on a common
 *    baseline and a pose swap moves nothing but the character.
 *
 * Run with `npm run assets:mascot`. It is not part of `npm run build`: the inputs change a
 * handful of times in the life of the site, and a 20-second sharp pass on every build to
 * recompute a byte-identical result is a bad trade. Outputs are committed.
 */
import { Buffer } from 'node:buffer';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(root, 'assets/mascot');
const OUT_DIR = path.join(root, 'public/mascot');

/**
 * One canvas for every pose, in device pixels.
 *
 * 420 tall is two times the largest size the mascot is ever displayed at (210px, the home hero),
 * so it stays sharp on a 2× screen and is never upscaled. The 0.86 ratio is wider than any
 * standing pose needs, because the pointing pose throws an arm out sideways and a canvas fitted
 * to the standing silhouette would scale that pose down to fit — making it, alone, smaller.
 */
const CANVAS = { width: 360, height: 420 };
/** Breathing room so no pose touches an edge, where WebP ringing is most visible. */
const PADDING = 8;

/**
 * The sprites, and the per-pose corrections the artwork needs.
 *
 * `scale` multiplies the normalised height. It is a correction for how a pose was *drawn*, not
 * for how it was framed — framing is already handled by the trim. Two of these are real:
 * a sitting character that stands as tall as a standing one looks like a giant, and any pose the
 * model drew at a different body scale has to be pulled back by hand.
 */
const POSES = [
  { name: 'idle', scale: 1 },
  { name: 'thinking', scale: 1 },
  { name: 'correct', scale: 1 },
  { name: 'wrong', scale: 1 },
  { name: 'celebrate', scale: 1 },
  { name: 'pointing', scale: 1 },
  /*
   * Sitting. Normalising it to the standing height would draw it half again life size, so it has
   * to come down — but not by as much as the folded posture suggests. The trim measures the whole
   * figure, and a seated figure is short because its legs are tucked, not because the character
   * is smaller; scaling by the height difference shrinks the head too, and the head is what reads
   * as how big the character is. Tuned against `idle` by matching head size, not total height:
   * below about 0.9 it stops being Neurone asleep and becomes a smaller, younger Neurone.
   */
  { name: 'asleep', scale: 0.92 },
];

/**
 * Two gates, both detecting the same underlying mistake: art drawn for a dark background.
 *
 * The mascot has to sit on `--bg` in the light theme and on `--bg` in the dark one, and it does
 * that by being a light body inside a dark ink outline — a sticker, legible either way. Ask an
 * image model for a pose on a black background and it will sometimes helpfully redraw the
 * character *for* black: outline in white, a soft glow around the silhouette. On the dark theme
 * the result looks better than the real thing. On the light theme the outline vanishes and the
 * glow becomes a halo, and the character reads as a faint ghost.
 *
 * Neither is recoverable here — the missing dark and the extra light are facts about the source
 * pixels. So these gates do not attempt a fix; they name the file to regenerate. Without them the
 * failure mode is silent for anyone developing in dark mode, which is most people.
 *
 * `INK_RATIO_MIN`: fraction of the opaque figure that is dark outline. Correctly drawn poses
 * measure 0.13–0.16 and a pose drawn with a white outline measures exactly zero, so the threshold
 * sits in a gap it is in no danger of falling into by accident.
 *
 * `GLOW_RATIO_LIMIT`: partially transparent pixels as a fraction of solid ones. A hard-edged
 * flat-vector character has these only along its outline; a glow puts a wide skirt of them
 * around the whole silhouette.
 */
const INK_RATIO_MIN = 0.05;
const GLOW_RATIO_LIMIT = 0.15;
/** Sum of RGB below which a pixel counts as outline ink rather than body or accent. */
const INK_SUM_MAX = 260;

/** Alpha below this is background; above it, ink. Between, the antialiased edge. */
const EDGE_LOW = 12;
const EDGE_HIGH = 230;

/**
 * Derives alpha from luminance for art matted on black, and un-premultiplies the colour.
 *
 * A pixel at 40% coverage was written as 40% of its own colour over black, so dividing the colour
 * back out is what recovers the original — skipping it leaves every edge pixel darkened towards
 * black, which is the muddy fringe that gives away a naive key. Returns the image unchanged when
 * it already carries real transparency.
 */
async function keyBlackMatte(image) {
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) transparent += 1;
  }
  if (transparent > 0) return { data, info, keyed: false };

  for (let i = 0; i < data.length; i += 4) {
    const alpha = Math.max(data[i], data[i + 1], data[i + 2]);
    if (alpha === 0) {
      data[i + 3] = 0;
      continue;
    }
    const gain = 255 / alpha;
    data[i] = Math.min(255, Math.round(data[i] * gain));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * gain));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * gain));
    data[i + 3] = alpha;
  }
  return { data, info, keyed: true };
}

/** Edge softness and outline darkness, in one pass. See the gate constants. */
function measure(data) {
  let edge = 0;
  let solid = 0;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha > EDGE_HIGH) {
      solid += 1;
      if (data[i] + data[i + 1] + data[i + 2] < INK_SUM_MAX) ink += 1;
    } else if (alpha > EDGE_LOW) edge += 1;
  }
  return solid === 0
    ? { glow: Infinity, ink: 0 }
    : { glow: edge / solid, ink: ink / solid };
}

async function buildPose(pose) {
  const source = path.join(SOURCE_DIR, `neuron-${pose.name}.png`);
  const { data, info, keyed } = await keyBlackMatte(sharp(source));

  const quality = measure(data);
  const raw = sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });

  /*
   * Trim on alpha, then rescale. `trim` needs the background it is trimming to; giving it a
   * transparent one makes it cut to the ink rather than to whatever the corner pixel happens to
   * be, which for keyed art is a near-black that is *not* the same near-black everywhere.
   */
  const trimmed = await raw
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .toBuffer({ resolveWithObject: true });

  const boxWidth = CANVAS.width - PADDING * 2;
  const boxHeight = CANVAS.height - PADDING * 2;
  const fit = Math.min(
    boxWidth / trimmed.info.width,
    (boxHeight / trimmed.info.height) * pose.scale,
  );
  const width = Math.max(1, Math.round(trimmed.info.width * fit));
  const height = Math.max(1, Math.round(trimmed.info.height * fit));

  /* Still a raw buffer — `trim` does not encode, so sharp has to be told the shape again. */
  const resized = await sharp(trimmed.data, {
    raw: { width: trimmed.info.width, height: trimmed.info.height, channels: 4 },
  })
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();

  const out = path.join(OUT_DIR, `neuron-${pose.name}.webp`);
  const written = await sharp({
    create: {
      width: CANVAS.width,
      height: CANVAS.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resized,
        /* Bottom-aligned and centred: a common baseline is what stops a pose swap from bouncing. */
        left: Math.round((CANVAS.width - width) / 2),
        top: CANVAS.height - PADDING - height,
      },
    ])
    /*
     * Near-lossless. The art is flat colour with hard outlines, which is the worst case for a
     * lossy codec — quality 80 puts visible mosquito noise along every edge, and at this size the
     * whole sprite is a few kilobytes either way, so there is nothing to buy by trading it.
     */
    .webp({ quality: 95, effort: 6 })
    .toFile(out);

  return { pose: pose.name, keyed, quality, bytes: written.size, width, height };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const present = new Set(await readdir(SOURCE_DIR));
  const missing = POSES.filter((p) => !present.has(`neuron-${p.name}.png`));
  const buildable = POSES.filter((p) => present.has(`neuron-${p.name}.png`));

  const results = [];
  for (const pose of buildable) results.push(await buildPose(pose));

  const warnings = [];
  const suspect = new Set();
  let total = 0;
  for (const r of results) {
    total += r.bytes;
    const file = `assets/mascot/neuron-${r.pose}.png`;
    if (r.quality.ink < INK_RATIO_MIN) {
      suspect.add(r.pose);
      warnings.push(
        `${file} has no dark outline (ink ${r.quality.ink.toFixed(3)}) — it was drawn for a dark ` +
          `background and disappears on the light theme. Regenerate with the outline at #22222F.`,
      );
    }
    if (r.quality.glow > GLOW_RATIO_LIMIT) {
      suspect.add(r.pose);
      warnings.push(
        `${file} has a glow baked around the silhouette (edge ${r.quality.glow.toFixed(2)}) — ` +
          `it becomes a halo on the light theme. Regenerate with no glow.`,
      );
    }
    console.log(
      `${suspect.has(r.pose) ? '!' : '·'} ${r.pose.padEnd(10)}` +
        ` ${String(Math.round(r.bytes / 1024)).padStart(3)} KB  ${r.width}×${r.height}` +
        `${r.keyed ? '  (keyed off black)' : ''}`,
    );
  }
  for (const p of missing) warnings.push(`assets/mascot/neuron-${p.name}.png is missing`);

  console.log(`\n${results.length} sprites, ${Math.round(total / 1024)} KB total`);
  for (const w of warnings) console.warn(`\nwarning: ${w}`);

  /*
   * Warnings, not failures. A pose that needs redrawing should not block a deploy of everything
   * else, so the sprite is still written and `needsRework` records the verdict for
   * `tests/mascot.test.ts` to report on. The alternative — refusing to emit — leaves the site
   * with a missing pose and no explanation at the place it is missing from.
   */
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(
      {
        canvas: CANVAS,
        poses: results.map((r) => r.pose).sort(),
        needsRework: [...suspect].sort(),
      },
      null,
      2,
    )}\n`,
  );
}

await main();
