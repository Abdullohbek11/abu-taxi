import { execSync } from 'node:child_process';
import { config } from 'dotenv';

/** Test bazasiga migratsiyalarni qo'llaydi (bir marta, barcha testlardan oldin). */
export default function setup() {
  config({ path: '.env.test', override: true });
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });
}
