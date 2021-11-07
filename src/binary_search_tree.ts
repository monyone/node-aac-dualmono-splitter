export default class BinarySearchTree {
  private _index: number | null = null;
  private children: [BinarySearchTree | null, BinarySearchTree | null] = [null, null];

  public get isLeaf(): boolean {
    return this._index != null;
  }

  public get index(): number | null {
    return this._index;
  }

  public append(index: number, codeword: number, length: number): void {
    if (length === 0) {
      this._index = index;
      return;
    }

    const next = (codeword & (1 << (length - 1))) >> (length - 1);
    if (this.children[next] == null) {
      this.children[next] = new BinarySearchTree();
    }

    this.children[next]!.append(index, codeword & ((1 << (length - 1)) - 1), length - 1);
  }

  public select(next: number): BinarySearchTree | null {
    return this.children[next] ?? null;
  }
}
