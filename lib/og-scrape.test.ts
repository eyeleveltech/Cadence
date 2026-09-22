import { describe, it, expect } from "vitest";
import { isPublicAddress } from "./og-scrape";

/**
 * The mood board fetches whatever URL someone pastes into it, from
 * inside the network that holds Postgres and Redis. This classifier is
 * the only thing standing between "add a reference" and a request
 * forgery primitive, so it gets pinned down properly.
 */
describe("isPublicAddress", () => {
  it("allows ordinary public addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "142.250.190.78", "2606:4700:4700::1111"]) {
      expect(isPublicAddress(address)).toBe(true);
    }
  });

  it("blocks the cloud metadata endpoint", () => {
    expect(isPublicAddress("169.254.169.254")).toBe(false);
  });

  it("blocks loopback, where Redis and Postgres live", () => {
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("127.1.2.3")).toBe(false);
    expect(isPublicAddress("::1")).toBe(false);
  });

  it("blocks every private IPv4 range", () => {
    for (const address of ["10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.1"]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("allows the public addresses that sit just outside those ranges", () => {
    expect(isPublicAddress("172.15.0.1")).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("192.169.0.1")).toBe(true);
    expect(isPublicAddress("11.0.0.1")).toBe(true);
  });

  it("blocks carrier-grade NAT, multicast, broadcast and 0.0.0.0", () => {
    for (const address of ["100.64.0.1", "224.0.0.1", "255.255.255.255", "0.0.0.0"]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("blocks IPv6 link-local, unique-local and multicast", () => {
    for (const address of ["fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::"]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("sees through an IPv4 address wearing a v6 hat", () => {
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:169.254.169.254")).toBe(false);
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it("rejects anything that isn't an address", () => {
    for (const junk of ["", "localhost", "not-an-ip", "999.999.999.999"]) {
      expect(isPublicAddress(junk)).toBe(false);
    }
  });
});
