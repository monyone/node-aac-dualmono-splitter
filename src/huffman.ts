import {
  scalefactor,
  spectrum1,
  spectrum2,
  spectrum3,
  spectrum4,
  spectrum5,
  spectrum6,
  spectrum7,
  spectrum8,
  spectrum9,
  spectrum10,
  spectrum11,
} from './codebook';

import BinarySearchTree from './binary_search_tree'
export const HUFFMAN_SF = new BinarySearchTree();
scalefactor.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_SF.append(index, codeword, length);
});

const HUFFMAN_1 = new BinarySearchTree();
spectrum1.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_1.append(index, codeword, length);
});

const HUFFMAN_2 = new BinarySearchTree();
spectrum2.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_2.append(index, codeword, length);
});

const HUFFMAN_3 = new BinarySearchTree();
spectrum3.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_3.append(index, codeword, length);
});

const HUFFMAN_4 = new BinarySearchTree();
spectrum4.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_4.append(index, codeword, length);
});

const HUFFMAN_5 = new BinarySearchTree();
spectrum5.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_5.append(index, codeword, length);
});

const HUFFMAN_6 = new BinarySearchTree();
spectrum6.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_6.append(index, codeword, length);
});

const HUFFMAN_7 = new BinarySearchTree();
spectrum7.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_7.append(index, codeword, length);
});

const HUFFMAN_8 = new BinarySearchTree();
spectrum8.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_8.append(index, codeword, length);
});

const HUFFMAN_9 = new BinarySearchTree();
spectrum9.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_9.append(index, codeword, length);
});

const HUFFMAN_10 = new BinarySearchTree();
spectrum10.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_10.append(index, codeword, length);
});

const HUFFMAN_11 = new BinarySearchTree();
spectrum11.forEach((elem: [number, number], index: number) => {
  const [codeword, length] = elem;
  HUFFMAN_11.append(index, codeword, length);
});

export const HUFFMAN_QUADS = [
  HUFFMAN_1, HUFFMAN_2, HUFFMAN_3, HUFFMAN_4,
];

export const HUFFMAN_PAIRS = [
  HUFFMAN_5, HUFFMAN_6, HUFFMAN_7, HUFFMAN_8, HUFFMAN_9, HUFFMAN_10, HUFFMAN_11,
];

export const HUFFMAN_SF_FUNC = (index: number) => {
  return index - 60;
}

type QUAD = {
  signed: boolean,
  w: number,
  x: number,
  y: number,
  z: number,
};
const convert_quad_func = (signed: boolean, LAV: number): (index: number) => QUAD => {
  const off = signed ? LAV : 0;
  const mod = signed ? 2 * LAV + 1 : LAV + 1;

  return (index: number) => {
    const w = Math.floor(index / (mod * mod * mod)) - off;
    index -= (w + off) * mod * mod * mod;
    const x = Math.floor(index / (mod * mod)) - off;
    index -= (x + off) * mod * mod;
    const y = Math.floor(index / mod) - off;
    index -= (y + off) * mod;
    const z = index - off;

    return {
      signed,
      w,
      x,
      y,
      z,
    }
  }
};
export const HUFFMAN_QUADS_FUNC = [
  convert_quad_func(true, 1),
  convert_quad_func(true, 1),
  convert_quad_func(false, 2),
  convert_quad_func(false, 2),
];

type PAIR = {
  signed: boolean
  y: number,
  z: number,
}
const convert_pair_func = (signed: boolean, LAV: number): (index: number) => PAIR => {
  const off = signed ? LAV : 0;
  const mod = signed ? 2 * LAV + 1 : LAV + 1;

  return (index: number) => {
    const y = Math.floor(index / mod) - off;
    index -= (y + off) * mod;
    const z = index - off;

    return {
      signed,
      y,
      z,
    }
  }
};
export const HUFFMAN_PAIRS_FUNC = [
  convert_pair_func(true, 4),
  convert_pair_func(true, 4),
  convert_pair_func(false, 7),
  convert_pair_func(false, 7),
  convert_pair_func(false, 12),
  convert_pair_func(false, 12),
  convert_pair_func(false, 16),
];
