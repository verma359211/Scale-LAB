import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const validRequestId = /^[a-zA-Z0-9._:-]{1,128}$/;

export function requestContext(instanceId: string): RequestHandler {
  return (request, response, next) => {
    const suppliedId = request.header("x-request-id")?.trim();
    const requestId = suppliedId && validRequestId.test(suppliedId) ? suppliedId : `req-${randomUUID()}`;

    response.locals.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    response.setHeader("x-instance-id", instanceId);

    next();
  };
}
