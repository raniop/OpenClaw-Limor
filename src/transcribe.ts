import OpenAI from "openai";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export async function transcribeAudio(audioBuffer: Buffer, mimetype: string): Promise<string> {
  const client = getClient();

  // Determine file extension from mimetype
  const ext = mimetype.includes("ogg") ? "ogg" : mimetype.includes("mp4") ? "mp4" : "ogg";
  const tempPath = resolve(__dirname, "..", `temp_audio_${Date.now()}.${ext}`);

  try {
    writeFileSync(tempPath, audioBuffer);

    const file = new File(
      [new Uint8Array(audioBuffer)],
      `audio.${ext}`,
      { type: mimetype }
    );

    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
      language: "he", // Default to Hebrew, Whisper auto-detects well
    });

    return transcription.text;
  } finally {
    try { unlinkSync(tempPath); } catch {}
  }
}
