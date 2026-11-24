declare module "exifr" {
  const exifr: {
    parse(input: Uint8Array, options?: Record<string, unknown>): Promise<Record<string, unknown> | undefined>;
  };
  export default exifr;
}
