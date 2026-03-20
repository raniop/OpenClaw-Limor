/**
 * Text-to-Speech for voice message responses.
 * Uses edge-tts (Python) when available, otherwise skips.
 */
import { execFile } from "child_process";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let edgeTtsAvailable: boolean | null = null;

/**
 * Check if edge-tts is installed.
 */
async function isEdgeTtsAvailable(): Promise<boolean> {
  if (edgeTtsAvailable !== null) return edgeTtsAvailable;

  return new Promise((resolve) => {
    execFile("python3", ["-m", "edge_tts", "--help"], { timeout: 5000 }, (err) => {
      edgeTtsAvailable = !err;
      if (edgeTtsAvailable) {
        console.log("[voice] edge-tts is available");
      } else {
        console.log("[voice] edge-tts not available — voice responses disabled. Install with: pip3 install edge-tts");
      }
      resolve(edgeTtsAvailable);
    });
  });
}

/**
 * Convert text to an audio buffer using edge-tts.
 * Returns { buffer, mimetype } or null if TTS is not available.
 *
 * @param text - Text to speak (best under 200 chars for voice note quality)
 * @param voice - Edge TTS voice name (default: Hebrew female)
 */
export async function textToVoice(
  text: string,
  voice: string = "he-IL-HilaNeural"
): Promise<{ buffer: Buffer; mimetype: string } | null> {
  const available = await isEdgeTtsAvailable();
  if (!available) return null;

  const outPath = join(tmpdir(), `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "python3",
        ["-m", "edge_tts", "--voice", voice, "--text", text, "--write-media", outPath],
        { timeout: 15000 },
        (err, _stdout, stderr) => {
          if (err) {
            reject(new Error(`edge-tts failed: ${err.message} ${stderr}`));
          } else {
            resolve();
          }
        }
      );
    });

    const buffer = await readFile(outPath);
    // Clean up temp file
    unlink(outPath).catch(() => {});

    return { buffer, mimetype: "audio/mpeg" };
  } catch (err) {
    console.error("[voice] TTS error:", err);
    // Clean up on error
    unlink(outPath).catch(() => {});
    return null;
  }
}
