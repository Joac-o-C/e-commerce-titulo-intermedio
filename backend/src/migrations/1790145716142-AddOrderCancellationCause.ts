import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fase 4 (revisión de código): causa de la cancelación de un pedido. Sólo
 * un pedido cancelado por vencimiento de la reserva puede pasar a "pagado"
 * con un pago tardío (CU-05 7a-1); uno cancelado por el cliente, el
 * administrador o la pasarela, no. Los pedidos ya cancelados antes de esta
 * migración fueron todos por vencimiento o por la pasarela en desarrollo:
 * quedan con causa NULL, que se trata como "no revivible".
 */

export class AddOrderCancellationCause1790145716142 implements MigrationInterface {
    name = 'AddOrderCancellationCause1790145716142'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."order_cancellation_cause" AS ENUM('reserva_vencida', 'pasarela', 'cliente', 'administrador')`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "cancellation_cause" "public"."order_cancellation_cause"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "cancellation_cause"`);
        await queryRunner.query(`DROP TYPE "public"."order_cancellation_cause"`);
    }

}
