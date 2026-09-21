/** Cap row delays so long lists do not keep waiting to appear. */
export function staggerDelay(index: number, step = 26, cap = 10) {
  return `${Math.min(index, cap) * step}ms`;
}
