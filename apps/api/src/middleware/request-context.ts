import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const validRequestId = /^[a-zA-Z0-9._:-]{1,128}$/;

export function requestContext(instanceId: string): RequestHandler {
  return (request, response, next) => {
    const suppliedId = request.header("x-request-id")?.trim();
    const requestId = suppliedId && validRequestId.test(suppliedId) ? suppliedId : `req-${randomUUID()}`;
    const startedAt = process.hrtime.bigint();

    response.locals.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    response.setHeader("x-instance-id", instanceId);

    response.on("finish", () => {
      const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
      const responseTimeMs = Number(elapsedNanoseconds) / 1_000_000;

      console.log(JSON.stringify({
        requestId,
        timestamp: new Date().toISOString(),
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        responseTimeMs: Number(responseTimeMs.toFixed(2)),
        instanceId,
      }));
    });

    next();
  };
}
