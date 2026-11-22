/** Escape SQL LIKE metacharacters before adding the application's own wildcards. */
export function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}
