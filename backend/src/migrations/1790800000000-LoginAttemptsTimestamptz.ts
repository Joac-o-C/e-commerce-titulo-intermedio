import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `login_attempts.created_at` era `timestamp` sin zona: Postgres lo guarda en
 * UTC y node-postgres lo lee como hora local, así que con el back en hora
 * argentina la ventana de bloqueo de CU-06 (flujo 5a) duraba 3 h de más.
 * Los valores existentes están en UTC (default `now()` del contenedor).
 */
export class LoginAttemptsTimestamptz1790800000000 implements MigrationInterface {
    name = 'LoginAttemptsTimestamptz1790800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "login_attempts" ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE USING "created_at" AT TIME ZONE 'UTC'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "login_attempts" ALTER COLUMN "created_at" TYPE TIMESTAMP USING "created_at" AT TIME ZONE 'UTC'`);
    }

}
