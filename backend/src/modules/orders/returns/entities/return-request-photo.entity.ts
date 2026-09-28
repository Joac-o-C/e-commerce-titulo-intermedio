import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { ReturnRequest } from './return-request.entity.js';

/** Foto adjunta como evidencia (CU-15 paso 4, hasta 3), guardada en el provider `storage`. */
@Entity('return_request_photos')
export class ReturnRequestPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ReturnRequest, (request) => request.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest: Relation<ReturnRequest>;

  @Column({ name: 'return_request_id' })
  returnRequestId: string;

  @Column()
  url: string;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;
}
