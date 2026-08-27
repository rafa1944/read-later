import { config } from 'dotenv';
import postgres from 'postgres';

/**
 * Deja la base de pruebas vacía antes de cada ejecución. Sin esto la suite no
 * es idempotente: los artículos de la vuelta anterior siguen ahí y guardarlos
 * de nuevo responde 200 en vez de 201, así que la segunda ejecución falla.
 */
export default async function setup() {
  config({ path: '.env.test', override: true });

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await sql`truncate table items, login_attempts`;
  await sql.end();
}
