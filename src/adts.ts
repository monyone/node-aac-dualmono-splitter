type ADTSHeader = {
  syncword: number
  mpeg_version: number,
  layer: number,
  protection: boolean,
  profile: number,
  frequency_index: number,
  private_bit: boolean,
  channel_configuration: number,
  originality: boolean,
  home: boolean,
  copyrighted: boolean,
  copyright: boolean,
  frame_length: number,
  buffer_fullness: number,
  frames: number,
}

export const parseADTSHeader = (buffer: Buffer, begin: number): ADTSHeader => {
  const syncword = (buffer[begin + 0] << 4) | ((buffer[begin + 1] & 0b11110000) >> 4);
  const mpeg_version = (buffer[begin + 1] & 0b00001000) >> 3;
  const layer = (buffer[begin+ 1] & 0b00000110) >> 1;
  const protection = (buffer[begin + 1] & 0b00000001) === 0;
  const profile = (buffer[begin + 2] & 0x11000000) >> 6;
  const frequency_index = (buffer[begin + 2] & 0b00111100) >> 2;
  const private_bit = (buffer[begin + 2] & 0b00000010) !== 0;
  const channel_configuration = ((buffer[begin + 2] & 0b00000001) << 2) | ((buffer[begin + 3] & 0b11000000) >> 6);
  const originality = (buffer[begin + 3] & 0b00100000) !== 0;
  const home = (buffer[begin + 3] & 0b00010000) !== 0;
  const copyrighted = (buffer[begin + 3] & 0b00001000) !== 0;
  const copyright = (buffer[begin + 3] & 0b00000100) !== 0;
  const frame_length = (((buffer[begin + 3] & 0x03) << 11) | (buffer[begin + 4] << 3) | ((buffer[begin + 5] & 0xE0) >> 5));
  const buffer_fullness = ((buffer[begin + 5] & 0x1F) << 6) | ((buffer[begin + 6] & 0xFC) >> 2);
  const frames = (buffer[begin + 6] & 0b00000011);

  return {
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
  }
}

export const generateADTSHeader = (header: ADTSHeader): Buffer => {
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
  } = header;
  
  return Buffer.from([
    ((syncword & 0xFF0) >> 4),
    ((syncword & 0x00F) << 4) | ((mpeg_version & 0x01) << 3) | ((layer & 0x03) << 1) | ((protection ? 0 : 1) << 0),
    ((profile & 0x3) << 6) | ((frequency_index & 0x0F) << 2) | ((private_bit ? 1 : 0) << 1) | ((channel_configuration & 0x04) >> 2),
    ((channel_configuration & 0x03) << 6) | ((originality ? 1 : 0) << 5) | ((home ? 1 : 0) << 4) | ((copyrighted ? 1 : 0) << 3) | ((copyright ? 1 : 0) << 2) | ((frame_length & 0x1800) >> 11),
    ((frame_length & 0x7F8) >> 3),
    ((frame_length & 0x7) << 5) | ((buffer_fullness & 0x7C0) >> 6),
    ((buffer_fullness & 0x3F) << 2) | ((frames & 0x03) >> 0),
  ]);
}
