export const PIPE_COLORS = ['#0077ff', '#28a745', '#dc3545', '#ffc107', '#00ffc8', '#ff6600', '#00b7ff', '#8e44ad', '#00aa00', '#fd7e14', '#e83e8c'];

export function pipeColor(index) {
  return PIPE_COLORS[index] || `hsl(${(index * 40) % 360} 70% 50%)`;
}

export function pipeColorExpression(diameters) {
  return ['match', ['to-string', ['get', 'diameter']], ...diameters.flatMap((diameter, index) => [String(diameter), pipeColor(index)]), '#dc3545'];
}
