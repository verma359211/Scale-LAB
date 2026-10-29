import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const CONTROL_TOKEN_HEADER = "x-scalelab-control-token";

export function requireControlToken(expectedToken: string): RequestHandler {
  return (request, response, next) => {
    const receivedToken = request.get(CONTROL_TOKEN_HEADER);
    if (!receivedToken || !tokensMatch(receivedToken, expectedToken)) {
      response.status(401).json({ error: "Test-control authorization is required" });
      return;
    }
    next();
  };
}

function tokensMatch(receivedToken: string, expectedToken: string) {
  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
