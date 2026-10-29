export const PRODUCTION_TARGET_URL = "https://scalelab.chandanverma.space";

export function configuredTarget(value: string | undefined) {
  const target = (value ?? PRODUCTION_TARGET_URL).replace(/\/$/, "");
  if (target !== PRODUCTION_TARGET_URL) {
    throw new Error(`SCALELAB_TARGET_URL must be ${PRODUCTION_TARGET_URL}`);
  }
  return target;
}
