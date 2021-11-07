export default class BitStream {
  private incoming_bits: number[];
  private consume_bits: number[];

  public constructor(binary: Buffer) {
    this.incoming_bits = [];
    this.consume_bits = [];

    for (let i = 0; i < binary.length; i++) {
      for (let j = 7; j >= 0; j--) {
        this.incoming_bits.push((binary[i] & (1 << j)) >> j);
      }
    }
  }

  public isEmpty(): boolean {
    return this.incoming_bits.length === 0;
  }

  public remains(): number {
    return this.incoming_bits.length;
  }

  public byteAlign(): number {
    return this.readBits(this.incoming_bits.length % 8);
  }

  public readBits(bits: number): number {
    if (this.incoming_bits.length < bits) {
      throw new Error();
    }

    let result = 0;

    while (bits > 0) {
      const bit = this.incoming_bits.shift()!;

      result <<= 1;
      result |= bit;
      this.consume_bits.push(bit);
      
      bits--;
    }

    return result;
  }

  public readBool(): boolean {
    return this.readBits(1) === 1;
  }

  public consumeLength(): number {
    return this.consume_bits.length;
  }

  public consumeArray(): number[] {
    return [ ... this.consume_bits ];
  }

  public consumeClear(): void {
    this.consume_bits = [];
  }
}
