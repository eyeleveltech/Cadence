import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import child_process from "child_process";
import fs from "fs";
import {
  resolveFfmpegPath,
  isFfmpegAvailable,
  resetFfmpegCache,
  processVideoAsset,
} from "./media-pipeline";
import { storage } from "./storage";

describe("Media Pipeline - Video Transcoding (lib/media-pipeline.ts)", () => {
  const originalEnv = process.env.FFMPEG_PATH;

  beforeEach(() => {
    resetFfmpegCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.FFMPEG_PATH = originalEnv;
    resetFfmpegCache();
    vi.restoreAllMocks();
  });

  describe("resolveFfmpegPath", () => {
    it("respects process.env.FFMPEG_PATH if configured", () => {
      process.env.FFMPEG_PATH = "/custom/bin/ffmpeg";
      expect(resolveFfmpegPath()).toBe("/custom/bin/ffmpeg");
    });

    it("defaults to 'ffmpeg' when FFMPEG_PATH is not set", () => {
      delete process.env.FFMPEG_PATH;
      expect(resolveFfmpegPath()).toBe("ffmpeg");
    });
  });

  describe("isFfmpegAvailable", () => {
    it("returns true when execFile succeeds", async () => {
      vi.spyOn(child_process, "execFile").mockImplementation(
        // @ts-expect-error mock callback
        (file: string, args: string[], callback: (error: null, stdout: string) => void) => {
          callback(null, "ffmpeg version 7.0");
        },
      );

      const available = await isFfmpegAvailable();
      expect(available).toBe(true);
    });

    it("returns false and does not throw when execFile fails", async () => {
      vi.spyOn(child_process, "execFile").mockImplementation(
        // @ts-expect-error mock callback
        (file: string, args: string[], callback: (error: Error) => void) => {
          callback(new Error("spawn ffmpeg ENOENT"));
        },
      );

      const available = await isFfmpegAvailable();
      expect(available).toBe(false);
    });

    it("caches the result to avoid repeated spawns", async () => {
      const spy = vi.spyOn(child_process, "execFile").mockImplementation(
        // @ts-expect-error mock callback
        (file: string, args: string[], callback: (error: null, stdout: string) => void) => {
          callback(null, "ffmpeg version 7.0");
        },
      );

      await isFfmpegAvailable();
      await isFfmpegAvailable();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("processVideoAsset", () => {
    it("returns empty array and logs warning if FFmpeg is not available", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(child_process, "execFile").mockImplementation(
        // @ts-expect-error mock callback
        (file: string, args: string[], callback: (error: Error) => void) => {
          callback(new Error("not found"));
        },
      );

      const variants = await processVideoAsset("client-1", "asset-1", Buffer.from("dummy video"));
      expect(variants).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("FFmpeg is not available on this host"),
      );
    });

    it("transcodes vertical variant and extracts thumbnail when FFmpeg is available", async () => {
      const execArgsList: string[][] = [];

      vi.spyOn(child_process, "execFile").mockImplementation(
        // @ts-expect-error mock callback
        (file: string, args: string[], callback: (error: null, stdout: string) => void) => {
          if (Array.isArray(args)) {
            execArgsList.push(args);
          }
          callback(null, "ok");
        },
      );

      // Mock fs.promises.writeFile, readFile, unlink
      vi.spyOn(fs.promises, "writeFile").mockResolvedValue(undefined);
      vi.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("mock video data"));
      vi.spyOn(fs.promises, "unlink").mockResolvedValue(undefined);

      // Mock storage.save
      const saveSpy = vi.spyOn(storage, "save").mockImplementation(async (key) => `/api/media/${key}`);

      const variants = await processVideoAsset("client-1", "asset-1", Buffer.from("dummy video"));

      expect(variants.length).toBe(3);
      const story = variants.find((v) => v.kind === "STORY_9X16");
      const reel = variants.find((v) => v.kind === "REEL_MP4");
      const thumb = variants.find((v) => v.kind === "THUMBNAIL");

      expect(story).toBeDefined();
      expect(story?.width).toBe(1080);
      expect(story?.height).toBe(1920);

      expect(reel).toBeDefined();
      expect(reel?.width).toBe(1080);
      expect(reel?.height).toBe(1920);

      expect(thumb).toBeDefined();
      expect(thumb?.width).toBe(640);

      expect(saveSpy).toHaveBeenCalledWith(
        "client-1/asset-1/story_9_16.mp4",
        expect.any(Buffer),
        "video/mp4",
      );
      expect(saveSpy).toHaveBeenCalledWith(
        "client-1/asset-1/thumb.jpg",
        expect.any(Buffer),
        "image/jpeg",
      );

      // Verify the ffmpeg command arguments
      const verticalInvocation = execArgsList.find((args) =>
        args.some((a) => a.includes("scale=1080:1920")),
      );
      expect(verticalInvocation).toBeDefined();
      expect(verticalInvocation).toContain("-preset");
      expect(verticalInvocation).toContain("fast");
      expect(verticalInvocation).toContain("+faststart");

      const thumbInvocation = execArgsList.find((args) =>
        args.some((a) => a.includes("00:00:01.000")),
      );
      expect(thumbInvocation).toBeDefined();
      expect(thumbInvocation).toContain("-vframes");
      expect(thumbInvocation).toContain("1");
    });
  });
});

