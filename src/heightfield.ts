/**
 * Heights on a grid, and the algorithms that read a grid of heights: how
 * water would run over it, how much of it comes together, how far from
 * something each point is. They are pure and know nothing of islands, so
 * the same code could read any ground; the island is made of them in
 * `island.ts`, and what stands on the island stands on `Heightfield`.
 *
 * Everything here is written into arrays handed in or sized once, and a
 * sample allocates nothing, since the helicopter and the camera ask the
 * ground for its height every frame.
 */

/**
 * Heights on a grid of vertices, `cols` × `rows`, row-major (index
 * `j * cols + i`), vertex (i, j) at (originX + i * cell, originY + j * cell).
 * Square (i, j) has corners 00=(i,j) 10=(i+1,j) 11=(i+1,j+1) 01=(i,j+1) and
 * is drawn as two triangles split along 00–11: [00, 10, 11] and [00, 11, 01].
 * `heightAt` interpolates on exactly those triangles, so what stands on the
 * ground stands on what is drawn.
 */
export class Heightfield {
  constructor(
    readonly originX: number,
    readonly originY: number,
    readonly cell: number,
    readonly cols: number,
    readonly rows: number,
    readonly heights: Float32Array,
  ) {}

  /** The height at (x, y) on the drawn triangles; outside the grid, held to its edge. Allocates nothing. */
  heightAt(x: number, y: number): number {
    const { cols, rows, heights } = this;
    let fx = (x - this.originX) / this.cell,
      fy = (y - this.originY) / this.cell;
    if (fx < 0) fx = 0;
    else if (fx > cols - 1) fx = cols - 1;
    if (fy < 0) fy = 0;
    else if (fy > rows - 1) fy = rows - 1;
    // The last square takes the last row and column, so the edge itself is on a triangle.
    let i = fx | 0,
      j = fy | 0;
    if (i > cols - 2) i = cols - 2;
    if (j > rows - 2) j = rows - 2;
    const u = fx - i,
      v = fy - j;
    const k = j * cols + i;
    const h00 = heights[k];
    // Above the diagonal the triangle is [00, 11, 01]; on and below it, [00, 10, 11].
    if (u >= v) return h00 + u * (heights[k + 1] - h00) + v * (heights[k + cols + 1] - heights[k + 1]);
    return h00 + u * (heights[k + cols + 1] - heights[k + cols]) + v * (heights[k + cols] - h00);
  }

  /** The upward unit normal at vertex (i, j), from central differences (one-sided at the edge), written into `out` at `o`. */
  normalAt(i: number, j: number, out: Float32Array, o: number): void {
    const { cols, rows, heights, cell } = this;
    const ia = i > 0 ? i - 1 : 0,
      ib = i < cols - 1 ? i + 1 : cols - 1,
      ja = j > 0 ? j - 1 : 0,
      jb = j < rows - 1 ? j + 1 : rows - 1;
    const dx = (heights[j * cols + ib] - heights[j * cols + ia]) / ((ib - ia) * cell),
      dy = (heights[jb * cols + i] - heights[ja * cols + i]) / ((jb - ja) * cell);
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    out[o] = -dx * inv;
    out[o + 1] = -dy * inv;
    out[o + 2] = inv;
  }
}

/**
 * The priority-flood (Barnes 2014): water poured on a grid from its border
 * inward, always at the lowest place it can reach, which fills every
 * depression to the level at which it would spill. After `run`:
 *
 * - `filled[v]` is the spill level: the lowest height at which water at `v`
 *   could get out to the border, so it equals the height wherever water
 *   already runs out and is higher in a hollow;
 * - `down[v]` is the neighbour water leaves `v` by (−1 where it is already out: the border, or the sea);
 * - `order` lists the first `count` vertices, from the border (or the sea)
 *   upstream, so a vertex always comes after the one it drains to.
 *
 * Its buffers are sized once and a run writes into them, so it can be
 * flooded again after the land has been changed.
 */
export class Flood {
  readonly filled: Float32Array;
  readonly down: Int32Array;
  readonly order: Int32Array;
  /** How many vertices `order` holds after a run: all of them, unless an outlet level has left some out. */
  count = 0;
  /** A binary min-heap of vertex indices, keyed by `filled`. */
  private readonly heap: Int32Array;
  /** Vertices to be filled to the level just popped, taken in turn before the heap is: they are the hollows. */
  private readonly pits: Int32Array;
  private readonly seen: Uint8Array;
  private size = 0;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    const n = cols * rows;
    this.filled = new Float32Array(n);
    this.down = new Int32Array(n);
    this.order = new Int32Array(n);
    this.heap = new Int32Array(n);
    this.pits = new Int32Array(n);
    this.seen = new Uint8Array(n);
  }

  /**
   * Floods `heights`. Everything at or under `outlet` (the sea, for an island) is out already, needs no route and
   * is left out of `order`, and the flood begins at its shore and at the grid's border: a flood of the land
   * alone is half the work of one that takes the sea floor in too, and gives the land the same answer.
   */
  run(heights: Float32Array, outlet = -Infinity): void {
    const { cols, rows, filled, down, order, pits, seen } = this;
    const total = cols * rows;
    seen.fill(0);
    this.size = 0;
    if (outlet > -Infinity) {
      for (let v = 0; v < total; v++) {
        if (heights[v] > outlet) continue;
        seen[v] = 1;
        down[v] = -1;
        filled[v] = heights[v];
      }
      // The shore starts the flood: the outlet vertices that touch higher ground.
      for (let v = 0; v < total; v++) {
        if (seen[v] === 0 || !this.touchesLand(v, heights, outlet)) continue;
        this.push(v);
      }
    }
    // The border starts the flood, each at its own height: the sea floor, for an island.
    for (let i = 0; i < cols; i++) {
      this.start(i, heights);
      this.start((rows - 1) * cols + i, heights);
    }
    for (let j = 1; j < rows - 1; j++) {
      this.start(j * cols, heights);
      this.start(j * cols + cols - 1, heights);
    }
    let count = 0,
      head = 0,
      tail = 0;
    while (this.size > 0 || head < tail) {
      const c = head < tail ? pits[head++] : this.pop();
      order[count++] = c;
      const fc = filled[c];
      const j = (c / cols) | 0,
        i = c - j * cols;
      const j0 = j > 0 ? j - 1 : 0,
        j1 = j < rows - 1 ? j + 1 : j,
        i0 = i > 0 ? i - 1 : 0,
        i1 = i < cols - 1 ? i + 1 : i;
      for (let nj = j0; nj <= j1; nj++) {
        for (let ni = i0; ni <= i1; ni++) {
          const n = nj * cols + ni;
          if (seen[n] === 1) continue;
          seen[n] = 1;
          down[n] = c;
          if (heights[n] <= fc) {
            filled[n] = fc;
            pits[tail++] = n;
          } else {
            filled[n] = heights[n];
            this.push(n);
          }
        }
      }
    }
    this.count = count;
  }

  /** Whether any of the eight neighbours of `v` is over `level`. */
  private touchesLand(v: number, heights: Float32Array, level: number): boolean {
    const { cols, rows } = this;
    const j = (v / cols) | 0,
      i = v - j * cols;
    for (let nj = j > 0 ? j - 1 : 0; nj <= (j < rows - 1 ? j + 1 : j); nj++) {
      for (let ni = i > 0 ? i - 1 : 0; ni <= (i < cols - 1 ? i + 1 : i); ni++) {
        if (heights[nj * cols + ni] > level) return true;
      }
    }
    return false;
  }

  private start(v: number, heights: Float32Array): void {
    if (this.seen[v] === 1) return;
    this.seen[v] = 1;
    this.down[v] = -1;
    this.filled[v] = heights[v];
    this.push(v);
  }

  private push(v: number): void {
    const { heap, filled } = this;
    const key = filled[v];
    let k = this.size++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (filled[heap[p]] <= key) break;
      heap[k] = heap[p];
      k = p;
    }
    heap[k] = v;
  }

  private pop(): number {
    const { heap, filled } = this;
    const top = heap[0];
    const last = heap[--this.size];
    const n = this.size;
    if (n > 0) {
      const key = filled[last];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && filled[heap[c + 1]] < filled[heap[c]]) c++;
        if (filled[heap[c]] >= key) break;
        heap[k] = heap[c];
        k = c;
      }
      heap[k] = last;
    }
    return top;
  }
}

/**
 * The land with every hollow the flood found filled to a gentle bowl: each
 * vertex at least `epsilon` higher than the one it drains to, so a filled
 * hollow runs out to its spill and is not a flat that water has no way
 * across. Vertices at or under `floor` are left as they are, so the flat
 * floor of the sea is not raised by it. Written into `out`.
 */
export function fillGently(
  flood: Flood,
  heights: Float32Array,
  epsilon: number,
  floor: number,
  out: Float32Array,
): void {
  const { order, down, count } = flood;
  out.set(heights);
  for (let k = 0; k < count; k++) {
    const v = order[k];
    const d = down[v];
    if (d >= 0 && heights[v] > floor) out[v] = Math.max(heights[v], out[d] + epsilon);
  }
}

/**
 * Flow accumulation: each vertex passes what it has to the one it drains to,
 * the upstream ones first, which is the flood's order read backward. Start
 * `area` at what each vertex adds itself (1 for the rain on a cell) and it
 * ends as the count of cells whose water passes through that vertex.
 */
export function flowAccumulation(flood: Flood, area: Float32Array): void {
  const { order, down } = flood;
  for (let k = flood.count - 1; k >= 0; k--) {
    const v = order[k];
    const d = down[v];
    if (d >= 0) area[d] += area[v];
  }
}

/**
 * A box blur of a grid, `passes` times over, in place: each pass a running
 * mean of `2 * radius + 1` along the rows and then down the columns, the
 * edge held to its last value. `tmp` is a grid's worth of room.
 */
export function boxBlur(
  field: Float32Array,
  tmp: Float32Array,
  cols: number,
  rows: number,
  radius: number,
  passes: number,
): void {
  const inv = 1 / (2 * radius + 1);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < rows; j++) {
      const base = j * cols;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += field[base + Math.min(cols - 1, Math.max(0, k))];
      tmp[base] = sum * inv;
      for (let i = 1; i < cols; i++) {
        sum += field[base + Math.min(cols - 1, i + radius)] - field[base + Math.max(0, i - radius - 1)];
        tmp[base + i] = sum * inv;
      }
    }
    for (let i = 0; i < cols; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(rows - 1, Math.max(0, k)) * cols + i];
      field[i] = sum * inv;
      for (let j = 1; j < rows; j++) {
        sum += tmp[Math.min(rows - 1, j + radius) * cols + i] - tmp[Math.max(0, j - radius - 1) * cols + i];
        field[j * cols + i] = sum * inv;
      }
    }
  }
}

/**
 * The distance from each vertex to the nearest source, in world units, by a
 * chamfer sweep: down and across, then back, each step a cell, or a cell
 * and four-tenths for a diagonal. `dist` comes in holding 0 at the sources and
 * something large everywhere else, and goes out holding the distances; it
 * is never short of the true distance and at most a twelfth over it, which
 * is near enough for a margin kept from the water.
 */
export function chamfer(dist: Float32Array, cols: number, rows: number, cell: number): void {
  const a = cell,
    b = cell * Math.SQRT2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      let d = dist[k];
      if (i > 0 && dist[k - 1] + a < d) d = dist[k - 1] + a;
      if (j > 0) {
        if (dist[k - cols] + a < d) d = dist[k - cols] + a;
        if (i > 0 && dist[k - cols - 1] + b < d) d = dist[k - cols - 1] + b;
        if (i < cols - 1 && dist[k - cols + 1] + b < d) d = dist[k - cols + 1] + b;
      }
      dist[k] = d;
    }
  }
  for (let j = rows - 1; j >= 0; j--) {
    for (let i = cols - 1; i >= 0; i--) {
      const k = j * cols + i;
      let d = dist[k];
      if (i < cols - 1 && dist[k + 1] + a < d) d = dist[k + 1] + a;
      if (j < rows - 1) {
        if (dist[k + cols] + a < d) d = dist[k + cols] + a;
        if (i < cols - 1 && dist[k + cols + 1] + b < d) d = dist[k + cols + 1] + b;
        if (i > 0 && dist[k + cols - 1] + b < d) d = dist[k + cols - 1] + b;
      }
      dist[k] = d;
    }
  }
}
