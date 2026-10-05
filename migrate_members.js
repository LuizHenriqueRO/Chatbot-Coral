import fs from 'fs';
import 'dotenv/config';
import { query, createTables } from './src/db.js';

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('ERRO: A variável de ambiente DATABASE_URL não está configurada no seu painel da Railway.');
    console.error('Crie o banco de dados no painel, adicione o DATABASE_URL no .env e tente novamente.');
    process.exit(1);
  }

  await createTables();

  let members = [];
  try {
    members = JSON.parse(fs.readFileSync('members.json', 'utf8'));
  } catch (err) {
    console.error('ERRO: Arquivo members.json não encontrado ou inválido.');
    process.exit(1);
  }

  console.log(`Migrando ${members.length} membros para o banco de dados PostgreSQL...`);

  for (const member of members) {
    // Verifica se já existe pelo nome e telefone para não duplicar se rodar duas vezes
    const res = await query('SELECT id FROM members WHERE name = $1 AND phone = $2', [member.name, member.phone]);
    if (res.rows.length === 0) {
      await query(
        'INSERT INTO members (name, phone, birthday) VALUES ($1, $2, $3)',
        [member.name, member.phone, member.birthday]
      );
      console.log(`✓ ${member.name} adicionado.`);
    } else {
      console.log(`- ${member.name} já existe no banco. Pulando.`);
    }
  }

  console.log('\n✅ Migração concluída com sucesso!');
  process.exit(0);
}

migrate();
