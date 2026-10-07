// src/world/village/sim/minHeap.ts — binary min-heap of integer nodes keyed by float priority (for A* and the effort flood)

/** Pop returns the node with the smallest key; stale duplicates are the caller's to skip. */
export class MinHeap {
  private nodes = new Int32Array(1024);
  private keys = new Float32Array(1024);
  size = 0;

  push(node: number, key: number): void {
    if (this.size === this.nodes.length) this.grow();
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.nodes[i] = this.nodes[parent]!;
      this.keys[i] = this.keys[parent]!;
      i = parent;
    }
    this.nodes[i] = node;
    this.keys[i] = key;
  }

  pop(): number {
    const top = this.nodes[0]!;
    const lastNode = this.nodes[--this.size]!;
    const lastKey = this.keys[this.size]!;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1]! < this.keys[child]!) child++;
      if (this.keys[child]! >= lastKey) break;
      this.nodes[i] = this.nodes[child]!;
      this.keys[i] = this.keys[child]!;
      i = child;
    }
    this.nodes[i] = lastNode;
    this.keys[i] = lastKey;
    return top;
  }

  clear(): void {
    this.size = 0;
  }

  private grow(): void {
    const nodes = new Int32Array(this.nodes.length * 2);
    const keys = new Float32Array(this.keys.length * 2);
    nodes.set(this.nodes);
    keys.set(this.keys);
    this.nodes = nodes;
    this.keys = keys;
  }
}
