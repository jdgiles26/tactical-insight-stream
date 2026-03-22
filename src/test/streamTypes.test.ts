import { describe, it, expect } from "vitest";
import { detectProtocol, confidenceToPriority, priorityColor } from "@/lib/streamTypes";

describe("detectProtocol", () => {
  it("detects HLS from .m3u8 URL", () => {
    expect(detectProtocol("https://host.com/live/feed.m3u8")).toBe("hls");
    expect(detectProtocol("http://cam.local/stream.M3U8")).toBe("hls");
  });

  it("detects RTSP from rtsp:// prefix", () => {
    expect(detectProtocol("rtsp://camera:554/stream1")).toBe("rtsp");
    expect(detectProtocol("RTSP://192.168.1.100:554/live")).toBe("rtsp");
  });

  it("detects HTTPS from https:// prefix", () => {
    expect(detectProtocol("https://host.com/video.mp4")).toBe("https");
  });

  it("defaults to HTTP for plain http URLs", () => {
    expect(detectProtocol("http://host.com/video.mp4")).toBe("http");
  });

  it("defaults to HTTP for unknown schemes", () => {
    expect(detectProtocol("some-url")).toBe("http");
  });

  it("defaults to HTTP for empty string", () => {
    expect(detectProtocol("")).toBe("http");
  });

  it("defaults to HTTP for whitespace-only string", () => {
    expect(detectProtocol("   ")).toBe("http");
  });

  it("defaults to HTTP for non-video protocols", () => {
    expect(detectProtocol("ftp://server/file.dat")).toBe("http");
    expect(detectProtocol("ws://server/socket")).toBe("http");
  });
});

describe("confidenceToPriority", () => {
  it("returns high for high-priority labels with moderate confidence", () => {
    expect(confidenceToPriority(0.7, "military_vessel")).toBe("high");
    expect(confidenceToPriority(0.65, "person_overboard")).toBe("high");
  });

  it("returns high for very high confidence regardless of label", () => {
    expect(confidenceToPriority(0.90, "cargo_vessel")).toBe("high");
  });

  it("returns medium for moderate confidence", () => {
    expect(confidenceToPriority(0.70, "cargo_vessel")).toBe("medium");
  });

  it("returns low for lower confidence", () => {
    expect(confidenceToPriority(0.50, "buoy")).toBe("low");
  });

  it("returns none for very low confidence", () => {
    expect(confidenceToPriority(0.30, "buoy")).toBe("none");
  });
});

describe("priorityColor", () => {
  it("returns red for high priority", () => {
    expect(priorityColor("high")).toContain("239");
  });

  it("returns amber for medium priority", () => {
    expect(priorityColor("medium")).toContain("245");
  });

  it("returns blue for low priority", () => {
    expect(priorityColor("low")).toContain("59");
  });

  it("returns gray for none priority", () => {
    expect(priorityColor("none")).toContain("156");
  });
});
