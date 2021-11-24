import BitStream from './bitstream';

import {
  HUFFMAN_SF,
  HUFFMAN_SF_FUNC,
  HUFFMAN_QUADS,
  HUFFMAN_QUADS_FUNC,
  HUFFMAN_PAIRS,
  HUFFMAN_PAIRS_FUNC,
} from './huffman';
import BinarySearchTree from './binary_search_tree';

import {
  parseADTSHeader,
  generateADTSHeader,
} from './adts'

const ONLY_LONG_SEQUENCE = 0; // Table 44
const LONG_START_SEQUENCE = 1; // Table 44
const EIGHT_SHORT_SEQUENCE = 2; // Table 44
const LONG_STOP_SEQUENCE = 3; // Table 44

const num_swb_long_window_48khz = 49;
const swb_offset_long_window_48khz = [
  0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 108, 120, 132, 144, 160, 176, 196, 216, 240, 264, 292, 
  320, 352, 384, 416, 448, 480, 512, 544, 576, 608, 640, 672, 704, 736, 768, 800, 832, 864, 896, 928, 1024
];
const num_swb_short_window_48khz = 14;
const swb_offset_short_window_48khz = [
  0, 4, 8, 12, 16,  20, 28, 36, 44, 56, 68, 80, 96, 112, 128
];

type ics_info = {
  window_sequence: number,
  max_sfb: number,
  scale_factor_grouping: number,
};
const ics_info = (stream: BitStream): ics_info => {
  const PRED_SFB_MAX = 40; // Table 66 (48000 Hz)

  const ics_reserved_bit: number = stream.readBits(1);
  const window_sequence = stream.readBits(2);
  const window_shape = stream.readBits(1);
  let max_sfb: number = 0;
  let scale_factor_grouping: number = 0;

  if (window_sequence === EIGHT_SHORT_SEQUENCE) {
    max_sfb = stream.readBits(4);
    scale_factor_grouping = stream.readBits(7);
  } else {
    max_sfb = stream.readBits(6);
    const predictor_data_present = stream.readBool();
    if (predictor_data_present) {
      const predictor_reset = stream.readBool();
      if (predictor_reset) {
        const predictor_reset_group_number = stream.readBits(5);
      }
      for (let sfb = 0; sfb < Math.min(max_sfb, PRED_SFB_MAX); sfb++) {
        const prediction_used = stream.readBool();
      }
    }
  }

  return {
    window_sequence,
    max_sfb,
    scale_factor_grouping,
  };
}

type section_data = {
  sect_start: number[][],
  sect_end: number[][],
  sect_cb: number[][],
  num_sect: number[],
  sfb_cb: number[][],
};
const section_data = (window_sequence: number, max_sfb: number, num_window_groups: number, stream: BitStream): section_data => {
  const sect_esc_val = window_sequence === EIGHT_SHORT_SEQUENCE ? ((1 << 3) - 1) : ((1 << 5) - 1);

  const sect_start: number[][] = [];
  const sect_end: number[][] = [];
  const sect_cb: number[][] = [];
  const num_sect: number[] = [];
  const sfb_cb: number[][] = [];

  for (let g = 0; g < num_window_groups; g++) {
    sect_start.push([]);
    sect_end.push([]);
    sect_cb.push([]);
    sfb_cb.push([]);

    let k = 0, i = 0;
    while (k < max_sfb) {

      sect_cb[g].push(stream.readBits(4));
      let sect_len = 0;

      while (true) {
        const sect_len_incr = stream.readBits(window_sequence === EIGHT_SHORT_SEQUENCE ? 3 : 5);
        sect_len += sect_len_incr;
        if (sect_len_incr !== sect_esc_val) {
          break;
        }
      }

      sect_start[g].push(k);
      sect_end[g].push(k + sect_len);
      for (let sfb = k; sfb < k + sect_len; sfb++) {
        sfb_cb[g].push(sect_cb[g][i]);
      }

      k += sect_len;
      i++;
    }

    num_sect.push(i);
  }

  return {
    sect_start,
    sect_end,
    sect_cb,
    num_sect,
    sfb_cb,
  };
}

const scale_factor_data = (window_sequence: number, max_sfb: number, sfb_cb: number[][], num_window_groups: number, stream: BitStream): void => {
  const ZERO_HCB = 0;

  for (let g = 0; g < num_window_groups; g++) {
    for (let sfb = 0; sfb < max_sfb; sfb++) {
      if (sfb_cb[g][sfb] === ZERO_HCB) { continue; }

      let tree: BinarySearchTree | null = HUFFMAN_SF;
      while (tree && !tree.isLeaf) {
        tree = tree.select(stream.readBits(1));
      }
      if (!tree) { throw new Error(); }

    }
  }

  return;
}

const pulse_data = (stream: BitStream) => {
  const number_pulse = stream.readBits(2);
  const plus_start_sfb = stream.readBits(6);
  for (let i = 0; i < number_pulse + 1; i++) {
    const pulse_offset = stream.readBits(5);
    const pulse_amp = stream.readBits(4);
  }
}

const tns_data = (window_sequence: number, stream: BitStream) => {
  const num_windows = window_sequence === EIGHT_SHORT_SEQUENCE ? 8 : 1;
  const n_filt_bits = window_sequence === EIGHT_SHORT_SEQUENCE ? 1 : 2;
  const length_bits = window_sequence === EIGHT_SHORT_SEQUENCE ? 4 : 6;
  const order_bits = window_sequence === EIGHT_SHORT_SEQUENCE ? 3 : 5;

  for (let w = 0; w < num_windows; w++) {
    const n_filt = stream.readBits(n_filt_bits);
    let start_coef_bits = 3;
    if (n_filt) {
      const coef_res = stream.readBits(1);
      if (coef_res) { start_coef_bits = 4; }
    }

    for (let filt = 0; filt < n_filt; filt++) {
      const lenght = stream.readBits(length_bits);
      const order = stream.readBits(order_bits);
      if (order) {
        const direction = stream.readBits(1);
        const coef_compress = stream.readBool();
        for (let i = 0; i < order; i++) {
          const coef = stream.readBits(start_coef_bits - (coef_compress ? 1 : 0));
        }
      }
    }
  }
}

const gain_control_data = (window_sequence: number, stream: BitStream): void => {
  const max_band = stream.readBits(2);

  if (window_sequence === ONLY_LONG_SEQUENCE) {
    for (let bd = 0; bd <= max_band; bd++) {
      for (let wd = 0; wd < 1; wd++) {
        const adjust_num = stream.readBits(3);
        for (let ad = 0; ad < adjust_num; ad++) {
          const alevcode = stream.readBits(4);
          const aloccode = stream.readBits(4);
        }
      }
    }
  } else if (window_sequence === LONG_START_SEQUENCE) {
    for (let bd = 0; bd <= max_band; bd++) {
      for (let wd = 0; wd < 2; wd++) {
        const adjust_num = stream.readBits(3);
        for (let ad = 0; ad < adjust_num; ad++) {
          const alevcode = stream.readBits(4);
          if (wd === 0) {
            const aloccode = stream.readBits(4);
          } else {
            const aloccode = stream.readBits(2);
          }
        }
      }
    }
  } else if (window_sequence === EIGHT_SHORT_SEQUENCE) {
    for (let bd = 0; bd <= max_band; bd++) {
      for (let wd = 0; wd < 8; wd++) {
        const adjust_num = stream.readBits(3);
        for (let ad = 0; ad < adjust_num; ad++) {
          const alevcode = stream.readBits(4);
          const aloccode = stream.readBits(2);
        }
      }
    }
  } else if (window_sequence === LONG_STOP_SEQUENCE) {
    for (let bd = 0; bd <= max_band; bd++) {
      for (let wd = 0; wd < 2; wd++) {
        const adjust_num = stream.readBits(3);
        for (let ad = 0; ad < adjust_num; ad++) {
          const alevcode = stream.readBits(4);
          if (wd === 0) {
            const aloccode = stream.readBits(4);
          } else {
            const aloccode = stream.readBits(5);
          }
        }
      }
    }
  }
}

const spectral_data = (window_sequence: number, num_window_groups: number, num_sect: number[], sect_cb: number[][], sect_start: number[][], sect_end: number[][], sect_sfb_offset: number[][], stream: BitStream): void => {
  const ZERO_HCB = 0;
  const ESC_HCB = 11;
  const FIRST_PAIR_HCB = 5;

  for (let g = 0; g < num_window_groups; g++) {
    for (let i = 0; i < num_sect[g]; i++) {
      if (sect_cb[g][i] === ZERO_HCB) { continue; }
      if (sect_cb[g][i] > ESC_HCB) { continue; }

      for (let k = sect_sfb_offset[g][sect_start[g][i]]; k < sect_sfb_offset[g][sect_end[g][i]]; ) {
        if (sect_cb[g][i] < FIRST_PAIR_HCB) {
          const index = sect_cb[g][i] - 1;

          let tree: BinarySearchTree | null = HUFFMAN_QUADS[index];
          while (tree && !tree.isLeaf) {
            tree = tree.select(stream.readBits(1));
          }
          if (!tree) { throw new Error(); }

          let { signed, w, x, y, z } = HUFFMAN_QUADS_FUNC[index](tree.index!);
          if (!signed) {
            if (w !== 0) {
              if (stream.readBool()) { w = -w; }
            }
            if (x !== 0) {
              if (stream.readBool()) { x = -x; }
            }
            if (y !== 0) {
              if (stream.readBool()) { y = -y; }
            }
            if (z !== 0) {
              if (stream.readBool()) { z = -z; }
            }
          }

          k += 4;
        } else {
          const index = sect_cb[g][i] - FIRST_PAIR_HCB;

          let tree: BinarySearchTree | null = HUFFMAN_PAIRS[index];
          while (tree && !tree.isLeaf) {
            tree = tree.select(stream.readBits(1));
          }
          if (!tree) { throw new Error(); }

          let { signed, y, z } = HUFFMAN_PAIRS_FUNC[index](tree.index!);

          if (!signed) {
            if (y !== 0) {
              if (stream.readBool()) { y = -y; }
            }
            if (z !== 0) {
              if (stream.readBool()) { z = -z; }
            }
          }

          if (sect_cb[g][i] === ESC_HCB) {
            if (Math.abs(y) === 16) {
               let count = 0;
               while (true) {
                 if(!stream.readBool()) { break; }
                 count++;
               }
               const escape_word = stream.readBits(count + 4);
            }
            if (Math.abs(z) === 16) {
               let count = 0;
               while (true) {
                 if(!stream.readBool()) { break; }
                 count++;
               }
               const escape_word = stream.readBits(count + 4);
            }
          }

          k += 2;
        }
      }
    }
  }

}

const individual_channel_stream = (common_window: boolean, stream: BitStream): void => {
  const global_gain = stream.readBits(8);

  if (common_window) {
    throw new Error();
  }

  const {
    window_sequence,
    max_sfb,
    scale_factor_grouping,
  } = ics_info(stream);

  let num_window_groups = 1;
  const window_group_length: number[] = [1];
  let sect_sfb_offset: number[][] = [];

  if (window_sequence === EIGHT_SHORT_SEQUENCE) {
    for (let i = 0; i < 7; i++) {
      if ((scale_factor_grouping & (1 << (6 - i))) === 0) {
        num_window_groups += 1;
        window_group_length.push(1);
      } else {
        window_group_length[window_group_length.length - 1]++;
      }
    }
    for (let g = 0; g < num_window_groups; g++) {
      sect_sfb_offset.push([]);

      let offset = 0;
      for (let i = 0; i < max_sfb; i++) {
        const width = (swb_offset_short_window_48khz[i + 1] -swb_offset_short_window_48khz[i]) * window_group_length[g];
        sect_sfb_offset[g].push(offset);
        offset += width;
      }
      sect_sfb_offset[g].push(offset);
    }
  } else {
    sect_sfb_offset.push([]);
    for (let i = 0; i < max_sfb + 1; i++) {
      sect_sfb_offset[0].push(swb_offset_long_window_48khz[i]);
    }
  }

  const {
    sect_start,
    sect_end,
    sect_cb,
    num_sect,
    sfb_cb,
  } = section_data(window_sequence, max_sfb, num_window_groups, stream);
  scale_factor_data(window_sequence, max_sfb, sfb_cb, num_window_groups, stream);

  const pulse_data_present = stream.readBool();
  if (pulse_data_present) {
    pulse_data(stream);
  }

  const tns_data_present = stream.readBool();
  if (tns_data_present) {
    tns_data(window_sequence, stream);
  }

  const gain_control_data_present = stream.readBool();
  if (gain_control_data_present) {
    gain_control_data(window_sequence, stream);
  }

  //console.log(pulse_data_present, tns_data_present, gain_control_data_present, sect_start, sect_end, sect_cb, num_sect, sfb_cb);

  spectral_data(window_sequence, num_window_groups, num_sect, sect_cb, sect_start, sect_end, sect_sfb_offset, stream);

  return;
}

const single_channel_element = (stream: BitStream): void => {
  const element_instance_tag = stream.readBits(4);
  individual_channel_stream(false, stream);
  return;
};

const program_config_element = (stream: BitStream) => {
  const element_instance_tag = stream.readBits(4);
  const profile = stream.readBits(2);
  const sampling_frequency_index = stream.readBits(4);
  const num_front_channel_elements = stream.readBits(4);
  const num_side_channel_elements = stream.readBits(4);
  const num_back_channel_elements = stream.readBits(4);
  const num_lfe_channel_elements = stream.readBits(2);
  const num_assoc_data_elements = stream.readBits(3);
  const num_valid_cc_elements = stream.readBits(4);
  const mono_mixdown_present = stream.readBool();
  if (mono_mixdown_present) {
    const mono_mixdown_element_number = stream.readBits(4);
  }
  const stereo_mixdown_present = stream.readBool();
  if (stereo_mixdown_present) {
    const stereo_mixdown_element_number = stream.readBits(4);
  }
  const matrix_mixdown_idx_present = stream.readBool();
  if (matrix_mixdown_idx_present) {
    const matrix_mixdown_idx = stream.readBits(2);
    const pseudo_surround_enable = stream.readBool();
  }
  for (let i = 0; i < num_front_channel_elements; i++) {
    const front_element_is_cpe = stream.readBool();
    const front_element_tag_select = stream.readBits(4);
  }
  for (let i = 0; i < num_side_channel_elements; i++) {
    const side_element_is_cpe = stream.readBool();
    const side_element_tag_select = stream.readBits(4);
  }
  for (let i = 0; i < num_back_channel_elements; i++) {
    const back_element_is_cpe = stream.readBool();
    const back_element_tag_select = stream.readBits(4);
  }
  for (let i = 0; i < num_lfe_channel_elements; i++) {
    const lfe_element_tag_select = stream.readBits(4);
  }
  for (let i = 0; i < num_assoc_data_elements; i++) {
    const assoc_data_element_tag_select = stream.readBits(4);
  }
  for (let i = 0; i < num_valid_cc_elements; i++) {
    const cc_element_is_ind_sw = stream.readBool();
    const valid_cc_element_tag_select = stream.readBits(4);
  }

  stream.byteAlign();
  
  const comment_field_bytes = stream.readBits(8);
  for (let i = 0; i < comment_field_bytes; i++) {
    const comment_field_data = stream.readBits(8);
  }
}

const extension_payload = (cnt: number, stream: BitStream) => {
  const extension_type = stream.readBits(4);
  const EXT_FILL = 0b0000;
  const EXT_FILL_DATA = 0b0001;
  const EXT_DYNAMIC_RANGE = 0b1011;
  const EXT_SBR_DATA = 0b1101;
  const EXT_SBR_DATA_CRC = 0b1110;

  if(extension_type === EXT_FILL_DATA) {
    const fill_nibble = stream.readBits(4);
    for (let i = 0; i < cnt - 1; i++) {
      const fill_byte = stream.readBits(8);
    }
    return cnt;
  } else if(extension_type === EXT_DYNAMIC_RANGE) {
    throw new Error();
  } else if(extension_type === EXT_SBR_DATA) {
    throw new Error();
  } else if(extension_type === EXT_SBR_DATA_CRC) {
    throw new Error();
  } else {
    for (let i = 0; i < 8 * (cnt - 1) + 4; i++) {
      const other_bits = stream.readBits(1);
    }
    return cnt;
  }
}

const fill_element = (stream: BitStream): void => {
  let cnt = stream.readBits(4);
  if (cnt == 15) {
    cnt += stream.readBits(8) - 1;
  }
  while (cnt > 0) {
    cnt -= extension_payload(cnt, stream);
  }
}

const ID_SCE = 0x00;
const ID_PCE = 0x05;
const ID_FIL = 0x06;
const ID_END = 0x07;

export const transmux_mono = (aac: Buffer): [Buffer, Buffer | null] => {
  // parse ADTS header
  const {
    syncword,
    mpeg_version,
    layer,
    protection,
    profile,
    frequency_index,
    private_bit,
    channel_configuration,
    originality,
    home,
    copyrighted,
    copyright,
    frame_length,
    buffer_fullness,
    frames,
  } = parseADTSHeader(aac, 0);

  if (channel_configuration !== 0) {
    return [aac, null];
  }

  const begin = (protection ? 9 : 7) + 2 * frames;
  const end = Math.min(aac.length, frame_length + 2 * frames);

  const bits: [number[], number[]] = [[], []];
  let idx = 0;

  const stream = new BitStream(aac.slice(begin, end));
  while (!stream.isEmpty()) {
    const id_syn_ele = stream.readBits(3);
    //console.log(stream.remains(), '/',  aac.length, frame_length, '=>', id_syn_ele)
    switch (id_syn_ele) {
      case ID_SCE:
        single_channel_element(stream);
        bits[idx].push(... stream.consumeArray());
        stream.consumeClear();
        idx += 1;
        break;
      case ID_PCE:
        program_config_element(stream);
        stream.consumeClear();
        break;
      case ID_FIL:
        fill_element(stream);
        stream.consumeClear();
        break;
      case ID_END:
        bits[0].push(... stream.consumeArray());
        bits[1].push(... stream.consumeArray());
        stream.consumeClear();
        break;
      default:
        stream.consumeClear();
        break;
    }
    if (id_syn_ele === ID_END) { break; }
  }

  // bytealign
  const result: [Buffer, Buffer] = [Buffer.from([]), Buffer.from([])];
  for (let i = 0; i < bits.length; i++) {
    while ((bits[i].length % 8) !== 0) { bits[i].push(0); }

    const bytes = [];
    for (let b = 0; b < bits[i].length; b += 8) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        byte <<= 1;
        byte |= bits[i][b + x];
      }
      bytes.push(byte);
    }

    const channel_configuration = 1;
    const protection = false;
    const frame_length = 7 + bytes.length;
    const frames = 0;

    const ADTS_header = generateADTSHeader({
      syncword,
      mpeg_version,
      layer,
      protection,
      profile,
      frequency_index,
      private_bit,
      channel_configuration,
      originality,
      home,
      copyrighted,
      copyright,
      frame_length,
      buffer_fullness,
      frames,
    });

    result[i] = Buffer.concat([
      ADTS_header,
      Buffer.from(bytes),
    ]);
  }

  return result;
};

export const transmux_stereo = (aac: Buffer): [Buffer, Buffer | null] => {
  // parse ADTS header
  const {
    syncword,
    mpeg_version,
    layer,
    protection,
    profile,
    frequency_index,
    private_bit,
    channel_configuration,
    originality,
    home,
    copyrighted,
    copyright,
    frame_length,
    buffer_fullness,
    frames,
  } = parseADTSHeader(aac, 0);

  if (channel_configuration !== 0) {
    return [aac, null];
  }

  const begin = (protection ? 9 : 7) + 2 * frames;
  const end = Math.min(aac.length, frame_length + 2 * frames);

  const bits: [number[], number[]] = [[], []];
  let idx = 0;

  const stream = new BitStream(aac.slice(begin, end));
  while (!stream.isEmpty()) {
    const id_syn_ele = stream.readBits(3);
    //console.log(stream.remains(), '/',  aac.length, frame_length, '=>', id_syn_ele)
    switch (id_syn_ele) {
      case ID_SCE: {
        stream.consumeClear();
        single_channel_element(stream);
        const element = stream.consumeArray();
        const tag = element.slice(0, 4);
        const elem = element.slice(4);

        bits[idx].push(0, 0, 1) // CPE
        bits[idx].push(... tag); // element_instance_tag
        bits[idx].push(0); // common_window = 0
        bits[idx].push(... elem); // L
        bits[idx].push(... elem); // R

        stream.consumeClear();
        idx += 1;
        break;
      }
      case ID_PCE:
        program_config_element(stream);
        stream.consumeClear();
        break;
      case ID_FIL:
        fill_element(stream);
        stream.consumeClear();
        break;
      case ID_END:
        bits[0].push(... stream.consumeArray());
        bits[1].push(... stream.consumeArray());
        stream.consumeClear();
        break;
      default:
        stream.consumeClear();
        break;
    }
    if (id_syn_ele === ID_END) { break; }
  }

  // bytealign
  const result: [Buffer, Buffer] = [Buffer.from([]), Buffer.from([])];
  for (let i = 0; i < bits.length; i++) {
    while ((bits[i].length % 8) !== 0) { bits[i].push(0); }

    const bytes = [];
    for (let b = 0; b < bits[i].length; b += 8) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        byte <<= 1;
        byte |= bits[i][b + x];
      }
      bytes.push(byte);
    }

    const channel_configuration = 2;
    const protection = false;
    const frame_length = 7 + bytes.length;
    const frames = 0;

    const ADTS_header = generateADTSHeader({
      syncword,
      mpeg_version,
      layer,
      protection,
      profile,
      frequency_index,
      private_bit,
      channel_configuration,
      originality,
      home,
      copyrighted,
      copyright,
      frame_length,
      buffer_fullness,
      frames,
    });

    result[i] = Buffer.concat([
      ADTS_header,
      Buffer.from(bytes),
    ]);
  }

  return result;
};
