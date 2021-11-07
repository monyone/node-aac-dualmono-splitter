import {
  TSPacket,
  TSPacketQueue,
  TSSection,
  TSSectionQueue,
  TSPES,
  TSPESQueue,
 } from 'arib-mpeg2ts-parser';
import { Writable }  from 'stream';

import { transmux } from './aac'

import fs from 'fs';
const sub = fs.createWriteStream('sub.adts');

class TSPESExtractor extends Writable {
  private packetQueue: TSPacketQueue = new TSPacketQueue();

  private pmtPid: number | null = null;
  private aacPid: number | null = null;

  private aacSequenceNumber: number = 0;
  private opusSequenceNumber: number = 0;

  private patSectionQueue: TSSectionQueue = new TSSectionQueue();
  private pmtSectionQueue: TSSectionQueue = new TSSectionQueue();
  private aacPESQueue: TSPESQueue = new TSPESQueue();

  _write(chunk: Buffer, encoding: 'binary', callback: (error?: Error | null) => void): void {
    this.packetQueue.push(chunk);

    while (!this.packetQueue.isEmpty()) {
      const packet: Buffer = this.packetQueue.pop()!;
      const pid: number = TSPacket.pid(packet);

      if (pid === 0x00) { // PAT
        this.patSectionQueue.push(packet)
        while (!this.patSectionQueue.isEmpty()) { 
          const PAT = this.patSectionQueue.pop()!;
          if (TSSection.CRC32(PAT) != 0) { continue; }

          let begin = TSSection.EXTENDED_HEADER_SIZE;
          while (begin < TSSection.BASIC_HEADER_SIZE + TSSection.section_length(PAT) - TSSection.CRC_SIZE) {
            const program_number = (PAT[begin + 0] << 8) | PAT[begin + 1];
            const program_map_PID = ((PAT[begin + 2] & 0x1F) << 8) | PAT[begin + 3];
            if (program_map_PID === 0x10) { begin += 4; continue; } // NIT

            if (this.pmtPid == null) {
              this.pmtPid = program_map_PID;
            }

            begin += 4;
          }
        }
      } else if (pid === this.pmtPid) {
        this.pmtSectionQueue.push(packet)
        while (!this.pmtSectionQueue.isEmpty()) {
          const PMT = this.pmtSectionQueue.pop()!;
          if (TSSection.CRC32(PMT) != 0) { continue; }

          const program_info_length = ((PMT[TSSection.EXTENDED_HEADER_SIZE + 2] & 0x0F) << 8) | PMT[TSSection.EXTENDED_HEADER_SIZE + 3];
          let begin = TSSection.EXTENDED_HEADER_SIZE + 4 + program_info_length;

          while (begin < TSSection.BASIC_HEADER_SIZE + TSSection.section_length(PMT) - TSSection.CRC_SIZE) {
            const stream_type = PMT[begin + 0];
            const elementary_PID = ((PMT[begin + 1] & 0x1F) << 8) | PMT[begin + 2];
            const ES_info_length = ((PMT[begin + 3] & 0x0F) << 8) | PMT[begin + 4];

            if(stream_type === 0x0F) { // AAC
              this.aacPid = elementary_PID;
            }

            begin += 5 + ES_info_length;
          }
        }
      } else if (pid === this.aacPid) {
        this.aacPESQueue.push(packet);
        while (!this.aacPESQueue.isEmpty()) {
          const AAC: Buffer = this.aacPESQueue.pop()!;

          let pts = 0;
          pts *= (1 << 3); pts += ((AAC[TSPES.PES_HEADER_SIZE + 3 + 0] & 0x0E) >> 1);
          pts *= (1 << 8); pts += ((AAC[TSPES.PES_HEADER_SIZE + 3 + 1] & 0xFF) >> 0);
          pts *= (1 << 7); pts += ((AAC[TSPES.PES_HEADER_SIZE + 3 + 2] & 0xFE) >> 1);
          pts *= (1 << 8); pts += ((AAC[TSPES.PES_HEADER_SIZE + 3 + 3] & 0xFF) >> 0);
          pts *= (1 << 7); pts += ((AAC[TSPES.PES_HEADER_SIZE + 3 + 4] & 0xFE) >> 1);

          const PES_header_data_length = AAC[TSPES.PES_HEADER_SIZE + 2];
          const begin = TSPES.PES_HEADER_SIZE + 3 + PES_header_data_length;
          const result = transmux(AAC.slice(begin));

          if (result[1] !== null) {
            sub.write(result[1]);
          }
        }
      }
    }

    callback();
  } 
}

process.stdin.pipe(new TSPESExtractor());
