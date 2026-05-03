import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";

const MAX_FETCH_BYTES = 200 * 1024 * 1024; // 200 MB

export const fetchVideoBuffer = async (videoUrl: string): Promise<Buffer> => {
  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_FETCH_BYTES) {
    throw new Error(
      `Video is too large to process (>${MAX_FETCH_BYTES / 1024 / 1024} MB). ` +
        "Please use a video under 200 MB.",
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const runFfmpeg = (args: string[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(
        new Error("ffmpeg binary not found. Reinstall ffmpeg-static."),
      );
    }

    const proc = spawn(ffmpegPath, args);
    let stderr = "";

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else if (
        stderr.includes("Output file is empty") ||
        stderr.includes("no audio") ||
        stderr.includes("does not contain any stream")
      ) {
        reject(new Error("This video has no audio track to transcribe."));
      } else {
        reject(new Error(`Audio extraction failed (ffmpeg exit ${code}).`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to launch ffmpeg: ${err.message}`));
    });
  });
};

/**
 * Extracts the audio track from a video buffer and returns it as an MP3 buffer.
 * A 100 MB video typically produces a 3–5 MB audio file — well within Groq's 25 MB limit.
 */
export const extractAudioBuffer = async (
  videoBuffer: Buffer,
  extension: string,
): Promise<Buffer> => {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary not found. Reinstall ffmpeg-static.");
  }

  const id = randomUUID();
  const tmp = tmpdir();
  const inputPath = join(tmp, `mc-video-${id}.${extension || "mp4"}`);
  const outputPath = join(tmp, `mc-audio-${id}.mp3`);

  await writeFile(inputPath, videoBuffer);

  try {
    await runFfmpeg([
      "-i", inputPath,
      "-vn",                    // strip video stream
      "-acodec", "libmp3lame",  // encode as MP3
      "-q:a", "5",              // VBR ~130 kbps — good balance of size and quality
      "-y",                     // overwrite if exists
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
};
