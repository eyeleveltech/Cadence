import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { parseSignedRequest, buildSignedRequest } from "./signed-request";

const SECRET = "test-app-secret";
const OTHER_SECRET = "someone-elses-secret";

describe("parseSignedRequest", () => {
  it("accepts a request signed with our app secret", () => {
    const signed = buildSignedRequest({ user_id: "12345", algorithm: "HMAC-SHA256" }, SECRET);
    expect(parseSignedRequest(signed, SECRET)?.user_id).toBe("12345");
  });

  // The signature is the only thing standing between "Meta asked us to
  // delete this" and "anyone on the internet asked us to delete this".
  it("rejects a request signed with a different secret", () => {
    const signed = buildSignedRequest({ user_id: "12345" }, OTHER_SECRET);
    expect(parseSignedRequest(signed, SECRET)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const signed = buildSignedRequest({ user_id: "12345" }, SECRET);
    const [sig] = signed.split(".");
    const forged = Buffer.from(JSON.stringify({ user_id: "99999" })).toString("base64url");
    expect(parseSignedRequest(`${sig}.${forged}`, SECRET)).toBeNull();
  });

  it("rejects an unsigned or malformed request", () => {
    for (const junk of ["", "bogus", "bogus.payload", ".", "a.", ".b"]) {
      expect(parseSignedRequest(junk, SECRET)).toBeNull();
    }
  });

  it("rejects an algorithm we don't sign with", () => {
    const signed = buildSignedRequest({ user_id: "1", algorithm: "NONE" }, SECRET);
    expect(parseSignedRequest(signed, SECRET)).toBeNull();
  });

  it("rejects everything when no app secret is configured", () => {
    const signed = buildSignedRequest({ user_id: "1" }, SECRET);
    expect(parseSignedRequest(signed, "")).toBeNull();
  });

  it("doesn't throw on a payload that isn't JSON", () => {
    const notJson = Buffer.from("definitely not json").toString("base64url");
    const sig = createHmac("sha256", SECRET).update(notJson).digest("base64url");
    expect(parseSignedRequest(`${sig}.${notJson}`, SECRET)).toBeNull();
  });
});
