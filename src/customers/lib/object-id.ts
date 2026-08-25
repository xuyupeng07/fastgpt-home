const OBJECT_ID_HEX_PATTERN = /^[0-9a-fA-F]{24}$/;

export function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_HEX_PATTERN.test(id);
}
