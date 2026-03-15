const CELL_SIZE = 200;

export class SpatialIndex {
  private cells = new Map<string, string[]>();
  private positions = new Map<string, { x: number; y: number }>();

  rebuild(nodes: { id: string; x: number; y: number }[]): void {
    this.cells.clear();
    this.positions.clear();
    for (const node of nodes) {
      this.positions.set(node.id, { x: node.x, y: node.y });
      const key = cell_key(node.x, node.y);
      const cell = this.cells.get(key);
      if (cell) cell.push(node.id);
      else this.cells.set(key, [node.id]);
    }
  }

  query_viewport(
    x: number,
    y: number,
    width: number,
    height: number,
  ): string[] {
    const min_col = Math.floor(x / CELL_SIZE);
    const max_col = Math.floor((x + width) / CELL_SIZE);
    const min_row = Math.floor(y / CELL_SIZE);
    const max_row = Math.floor((y + height) / CELL_SIZE);
    const result: string[] = [];
    for (let col = min_col; col <= max_col; col++) {
      for (let row = min_row; row <= max_row; row++) {
        const cell = this.cells.get(`${String(col)},${String(row)}`);
        if (cell) result.push(...cell);
      }
    }
    return result;
  }

  get_position(id: string): { x: number; y: number } | undefined {
    return this.positions.get(id);
  }
}

function cell_key(x: number, y: number): string {
  return `${String(Math.floor(x / CELL_SIZE))},${String(Math.floor(y / CELL_SIZE))}`;
}
