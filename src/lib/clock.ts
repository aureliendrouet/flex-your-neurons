/**
 * Where an analogue clock's hands point.
 *
 * Shared rather than owned by a renderer, because three places draw a clock face — the live
 * stimulus, the format-card miniature, and the social card, which is a second serialiser — and a
 * clock whose hands disagreed between them would be a clock that lies about the item. The geometry
 * is a handful of arithmetic, and one copy of it is the whole point of this module.
 *
 * Angles are degrees clockwise from twelve o'clock, so a renderer can hand them straight to a
 * rotation transform without deciding anything.
 */
import type { ClockFace } from './types';

/** Degrees per hour mark, and per minute mark, on a twelve-hour face. */
const PER_HOUR = 30;
const PER_MINUTE = 6;

export interface HandAngles {
  hour: number;
  minute: number;
}

/**
 * The two hands, with the face's own rotation already applied.
 *
 * The hour hand carries the minutes: at half past three it sits *between* three and four, which is
 * not a detail — a reader who takes it to point at three still gets the hour right, and a reader who
 * takes it to point at four does not. That fraction is what makes "the hour it is approaching" a
 * real misreading rather than a manufactured one, so it is drawn honestly.
 */
export function handAngles(face: ClockFace): HandAngles {
  const hour12 = face.hour % 12;
  return {
    hour: normalise(hour12 * PER_HOUR + face.minute * (PER_HOUR / 60) + face.rotation),
    minute: normalise(face.minute * PER_MINUTE + face.rotation),
  };
}

/** The angle of each hour mark on a face, in drawing order, with the rotation applied. */
export function tickAngles(rotation: number): number[] {
  return Array.from({ length: 12 }, (_, i) => normalise(i * PER_HOUR + rotation));
}

/** A point on the face, `radius` out from the centre along `angle`. */
export function pointAt(cx: number, cy: number, angle: number, radius: number): { x: number; y: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + Math.cos(radians) * radius, y: cy + Math.sin(radians) * radius };
}

function normalise(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Hours as they are spoken on a twelve-hour face: 0 and 12 are both "12", never "0". */
export function twelveHour(hour: number): number {
  const wrapped = ((hour % 12) + 12) % 12;
  return wrapped === 0 ? 12 : wrapped;
}
