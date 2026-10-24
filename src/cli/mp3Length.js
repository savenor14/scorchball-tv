// How long an MP3 clip plays (Task 187), from its frames: no decoder, no dependency. Each MPEG audio frame's header
// gives its bitrate and sample rate, so its size and how many samples it holds. Layer III only (what ffmpeg makes).

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES_V1 = [44100, 48000, 32000];

/**
 * The clip's length in seconds: its frames' samples over their sample rate, skipping an ID3 tag and anything that
 * isn't a frame header.
 * @param {Uint8Array} b  The file's bytes.
 */
export function mp3Seconds(b) {
  let i = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  let seconds = 0;
  while (i + 4 <= b.length) {
    // A frame sync, Layer III ((b1 >> 1) & 3 === 1), a known version (not 1).
    const version = (b[i + 1] >> 3) & 3;
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0 || ((b[i + 1] >> 1) & 3) !== 1 || version === 1) { i++; continue; }
    const v1 = version === 3;
    const kbps = (v1 ? BITRATES_V1 : BITRATES_V2)[b[i + 2] >> 4];
    const rateIndex = (b[i + 2] >> 2) & 3;
    if (!kbps || rateIndex === 3) { i++; continue; }
    // MPEG 2 halves the rate, MPEG 2.5 quarters it.
    const rate = RATES_V1[rateIndex] / (v1 ? 1 : version === 2 ? 2 : 4);
    const padding = (b[i + 2] >> 1) & 1;
    i += Math.floor(((v1 ? 144 : 72) * kbps * 1000) / rate) + padding;
    seconds += (v1 ? 1152 : 576) / rate;
  }
  return seconds;
}
