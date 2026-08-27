/**
 * PostgreSQL DATE values parsed by `pg` are local-midnight Date objects. Read their local calendar
 * components so a timezone conversion cannot move the database date to the previous UTC day.
 */
export function dateOnly(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    const year = String(value.getFullYear()).padStart(4, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return value.slice(0, 10);
}
