import {
  TSPacket,
  TSPacketQueue,
  TSSection,
  TSSectionQueue,
  TSSectionPacketizer,
  TSPES,
  TSPESQueue,
 } from 'arib-mpeg2ts-parser';

import { Transform, TransformCallback }  from 'stream';

import { transmux_mono, transmux_stereo } from './aac'

export default class DualmonoSplitTransform extends Transform {
  private packetQueue: TSPacketQueue = new TSPacketQueue();

  private pmtPid: number | null = null;
  private aac1stPid: number | null = null;
  private aac2ndPid: number | null = null;
  private aac1stMappedPid: number | null = 0x1FF0;
  private aac2ndMappedPid: number | null = 0x1FF1;

  private patSectionQueue: TSSectionQueue = new TSSectionQueue();
  private pmtSectionQueue: TSSectionQueue = new TSSectionQueue();
  private aac1stPESQueue: TSPESQueue = new TSPESQueue();
  private aac2ndPESQueue: TSPESQueue = new TSPESQueue();

  private pmtSequenceNumber: number = 0;
  private aac1stSequenceNumber: number = 0;
  private aac2ndSequenceNumber: number = 0;

  _transform (chunk: Buffer, encoding: string, callback: TransformCallback): void {
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
        this.push(packet);
      } else if (pid === this.pmtPid) {
        this.pmtSectionQueue.push(packet)
        while (!this.pmtSectionQueue.isEmpty()) {
          const PMT = this.pmtSectionQueue.pop()!;
          if (TSSection.CRC32(PMT) != 0) { continue; }

          const program_info_length = ((PMT[TSSection.EXTENDED_HEADER_SIZE + 2] & 0x0F) << 8) | PMT[TSSection.EXTENDED_HEADER_SIZE + 3];
          
          let begin = TSSection.EXTENDED_HEADER_SIZE + 4 + program_info_length;
          let newPMT = Buffer.from(PMT.slice(0, begin))

          this.aac1stPid = this.aac2ndPid = null;

          while (begin < TSSection.BASIC_HEADER_SIZE + TSSection.section_length(PMT) - TSSection.CRC_SIZE) {
            const stream_type = PMT[begin + 0];
            const elementary_PID = ((PMT[begin + 1] & 0x1F) << 8) | PMT[begin + 2];
            const ES_info_length = ((PMT[begin + 3] & 0x0F) << 8) | PMT[begin + 4];

            if(stream_type === 0x0F) { // AAC
              if (this.aac1stPid == null) {
                this.aac1stPid = elementary_PID;

                newPMT = Buffer.concat([
                  newPMT,
                  Buffer.from([stream_type]),
                  Buffer.from([
                    (this.aac1stMappedPid! & 0x1F00) >> 8,
                    (this.aac1stMappedPid! & 0x00FF) >> 0,
                  ]),
                  Buffer.from([
                    (ES_info_length & 0x0F00) >> 8,
                    (ES_info_length & 0x00FF) >> 0,
                  ]),
                  PMT.slice(begin + 5, begin + 5 + ES_info_length)
                ]);
              } else if (this.aac2ndPid == null) {
                this.aac2ndPid = elementary_PID;

                newPMT = Buffer.concat([
                  newPMT,
                  Buffer.from([stream_type]),
                  Buffer.from([
                    (this.aac2ndMappedPid! & 0x1F00) >> 8,
                    (this.aac2ndMappedPid! & 0x00FF) >> 0,
                  ]),
                  Buffer.from([
                    (ES_info_length & 0x0F00) >> 8,
                    (ES_info_length & 0x00FF) >> 0,
                  ]),
                  PMT.slice(begin + 5, begin + 5 + ES_info_length)
                ]);
              } else {
                newPMT = Buffer.concat([
                  newPMT,
                  Buffer.from([stream_type]),
                  Buffer.from([
                    (elementary_PID & 0x1F00) >> 8,
                    (elementary_PID & 0x00FF) >> 0,
                  ]),
                  Buffer.from([
                    (ES_info_length & 0x0F00) >> 8,
                    (ES_info_length & 0x00FF) >> 0,
                  ]),
                  PMT.slice(begin + 5, begin + 5 + ES_info_length)
                ]);
              }
            } else {
              newPMT = Buffer.concat([
                newPMT,
                Buffer.from([stream_type]),
                Buffer.from([
                  (elementary_PID & 0x1F00) >> 8,
                  (elementary_PID & 0x00FF) >> 0,
                ]),
                Buffer.from([
                  (ES_info_length & 0x0F00) >> 8,
                  (ES_info_length & 0x00FF) >> 0,
                ]),
                PMT.slice(begin + 5, begin + 5 + ES_info_length)
              ]);
            }

            begin += 5 + ES_info_length;
          }

          if (this.aac1stPid == null) {
            newPMT = Buffer.concat([
              newPMT,
              Buffer.from([0x0F]),
              Buffer.from([
                (this.aac1stMappedPid! & 0x1F00) >> 8,
                (this.aac1stMappedPid! & 0x00FF) >> 0,
              ]),
              Buffer.from([
                0,
                0,
              ]),
            ]);
          }

          if (this.aac2ndPid == null) {
            newPMT = Buffer.concat([
              newPMT,
              Buffer.from([0x0F]),
              Buffer.from([
                (this.aac2ndMappedPid! & 0x1F00) >> 8,
                (this.aac2ndMappedPid! & 0x00FF) >> 0,
              ]),
              Buffer.from([
                0,
                0,
              ])
            ]);
          }

          const newPMT_length = newPMT.length + TSSection.CRC_SIZE - TSSection.BASIC_HEADER_SIZE;
          newPMT[1] = (PMT[1] & 0xF0) | ((newPMT_length & 0x0F00) >> 8);
          newPMT[2] = (newPMT_length & 0x00FF);

          const newPMT_CRC = TSSection.CRC32(newPMT);
          newPMT = Buffer.concat([newPMT, Buffer.from([
            (newPMT_CRC & 0xFF000000) >> 24,
            (newPMT_CRC & 0x00FF0000) >> 16,
            (newPMT_CRC & 0x0000FF00) >> 8,
            (newPMT_CRC & 0x000000FF) >> 0,
          ])]);

          const packets = TSSectionPacketizer.packetize(
            newPMT,
            TSPacket.transport_error_indicator(packet),
            TSPacket.transport_priority(packet),
            pid,
            TSPacket.transport_scrambling_control(packet),
            this.pmtSequenceNumber
          );
          for (let i = 0; i < packets.length; i++) { this.push(packets[i]); }
          this.pmtSequenceNumber = (this.pmtSequenceNumber + packets.length) & 0x0F;
        }
      } else if (pid === this.aac1stPid) {
        this.aac1stPESQueue.push(packet);
        while (!this.aac1stPESQueue.isEmpty()) {
          const AAC: Buffer = this.aac1stPESQueue.pop()!;
          const PES_header_data_length = AAC[TSPES.PES_HEADER_SIZE + 2];
          const begin = TSPES.PES_HEADER_SIZE + 3 + PES_header_data_length;

          const result: [Buffer | null, Buffer | null] = transmux_stereo(AAC.slice(begin));

          if (result[0] != null) {
            const main = Buffer.concat([AAC.slice(0, begin), result[0]]);
            main[4] = ((main.length - TSPES.PES_HEADER_SIZE) & 0xFF00) >> 8;
            main[5] = ((main.length - TSPES.PES_HEADER_SIZE) & 0x00FF) >> 0;

            for (let i = 0; i < main.length; i += TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE) {
              const payload = main.slice(i, Math.min(main.length, i + 184));
              const header = Buffer.from([
                0x47,
                (i == 0 ? 0x40 : 0) | ((this.aac1stMappedPid! & 0x1f00) >> 8),
                ((this.aac1stMappedPid! & 0x00FF) >> 0),
                (payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE) ? 0x30 : 0x10) | (this.aac1stSequenceNumber++ & 0x0F),
              ]);
              const packet = Buffer.concat([
                header,
                Buffer.from((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE))
                  ? [(TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 1) - payload.length]
                  : []
                ),
                Buffer.from((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 1)) 
                  ? [0x00]
                  : []
                ), 
                ((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 2))
                  ? Buffer.alloc((TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 2) - payload.length, 0xFF) 
                  : Buffer.from([])
                ), 
                payload,
              ]);
              this.push(packet);
            }

            if (this.aac2ndPid == null && result[1] == null) {
              for (let i = 0; i < main.length; i += TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE) {
                const payload = main.slice(i, Math.min(main.length, i + 184));
                const header = Buffer.from([
                  0x47,
                  (i == 0 ? 0x40 : 0) | ((this.aac2ndMappedPid! & 0x1f00) >> 8),
                  ((this.aac2ndMappedPid! & 0x00FF) >> 0),
                  (payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE) ? 0x30 : 0x10) | (this.aac1stSequenceNumber++ & 0x0F),
                ]);
                const packet = Buffer.concat([
                  header,
                  Buffer.from((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE))
                    ? [(TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 1) - payload.length]
                    : []
                  ),
                  Buffer.from((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 1)) 
                    ? [0x00]
                    : []
                  ), 
                  ((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 2))
                    ? Buffer.alloc((TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 2) - payload.length, 0xFF) 
                    : Buffer.from([])
                  ), 
                  payload,
                ]);
                this.push(packet);
              }
            }
          }

          if (result[1] != null) {
            const sub = Buffer.concat([AAC.slice(0, begin), result[1]]);
            sub[4] = ((sub.length - TSPES.PES_HEADER_SIZE) & 0xFF00) >> 8;
            sub[5] = ((sub.length - TSPES.PES_HEADER_SIZE) & 0x00FF) >> 0;

            for (let i = 0; i < sub.length; i += TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE) {
              const payload = sub.slice(i, Math.min(sub.length, i + 184));
              const header = Buffer.from([
                0x47,
                (i == 0 ? 0x40 : 0) | ((this.aac2ndMappedPid! & 0x1f00) >> 8),
                ((this.aac2ndMappedPid! & 0x00FF) >> 0),
                (payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE) ? 0x30 : 0x10) | (this.aac1stSequenceNumber++ & 0x0F),
              ]);
              const packet = Buffer.concat([
                header,
                Buffer.from((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE))
                  ? [(TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 1) - payload.length]
                  : []
                ),
                Buffer.from((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 1)) 
                  ? [0x00]
                  : []
                ), 
                ((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 2))
                  ? Buffer.alloc((TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 2) - payload.length, 0xFF) 
                  : Buffer.from([])
                ), 
                payload,
              ]);
              this.push(packet);
            }
          }

        }

        this.push(packet);
      } else if (pid === this.aac2ndPid) {
        this.aac2ndPESQueue.push(packet);
        while (!this.aac2ndPESQueue.isEmpty()) {
          const AAC: Buffer = this.aac2ndPESQueue.pop()!;

          AAC[4] = ((AAC.length - TSPES.PES_HEADER_SIZE) & 0xFF00) >> 8;
          AAC[5] = ((AAC.length - TSPES.PES_HEADER_SIZE) & 0x00FF) >> 0;

          for (let i = 0; i < AAC.length; i += TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE) {
            const payload = AAC.slice(i, Math.min(AAC.length, i + 184));
            const header = Buffer.from([
              0x47,
              (i == 0 ? 0x40 : 0) | ((this.aac2ndMappedPid! & 0x1f00) >> 8),
              ((this.aac2ndMappedPid! & 0x00FF) >> 0),
              (payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE) ? 0x30 : 0x10) | (this.aac1stSequenceNumber++ & 0x0F),
            ]);
            const packet = Buffer.concat([
              header,
              Buffer.from((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE))
                ? [(TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 1) - payload.length]
                : []
              ),
              Buffer.from((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 1)) 
                ? [0x00]
                : []
              ), 
              ((payload.length < (TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 2))
                ? Buffer.alloc((TSPacket.PACKET_SIZE - TSPacket.HEADER_SIZE - 2) - payload.length, 0xFF) 
                : Buffer.from([])
              ), 
              payload,
            ]);
            this.push(packet);
          }

        }
        this.push(packet);
      } else {
        this.push(packet);
      }
    }

    callback();
  } 

  _flush (callback: TransformCallback): void {
    callback();
  }
}

