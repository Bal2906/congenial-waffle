import { neon } from '@neondatabase/serverless';

function getConnectionString(): string {
  if (typeof process !== 'undefined' && process.env && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  try {
    if (import.meta.env && import.meta.env.DATABASE_URL) {
      return import.meta.env.DATABASE_URL;
    }
  } catch {}
  return 'postgresql://neondb_owner:npg_RU6Kk2hmrxGV@ep-mute-butterfly-ac59udqd-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require';
}

export function getSql() {
  const connStr = getConnectionString();
  return neon(connStr);
}

// Helper to ensure database table & unique indexes exist
export async function initDb() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      source_file VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // B-Tree unique index for fast O(log N) deduplication
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_normalized_text 
    ON questions (lower(trim(question)));
  `;
}

export interface QuestionInput {
  question: string;
  correctAnswer: string;
  sourceFile?: string;
}

export async function saveQuestionsToDb(questions: QuestionInput[]) {
  await initDb();
  const sql = getSql();

  // 1. Pre-deduplicate in Node.js RAM (O(N) time)
  const uniqueInBatch = new Map<string, QuestionInput>();
  const inBatchDuplicates: { question: string; reason: string }[] = [];

  for (const item of questions) {
    const cleanQ = item.question.trim();
    if (!cleanQ) continue;
    const key = cleanQ.toLowerCase();

    if (!uniqueInBatch.has(key)) {
      uniqueInBatch.set(key, item);
    } else {
      inBatchDuplicates.push({
        question: cleanQ,
        reason: 'Duplicado detectado dentro del mismo lote subido'
      });
    }
  }

  const itemsToInsert = Array.from(uniqueInBatch.values());

  if (itemsToInsert.length === 0) {
    const countResult = await sql`SELECT count(*)::int as total FROM questions;`;
    return {
      insertedCount: 0,
      skippedCount: inBatchDuplicates.length,
      totalInDb: Number(countResult[0]?.total || 0),
      skippedItems: inBatchDuplicates
    };
  }

  let insertedCount = 0;
  let skippedDbCount = 0;
  const dbSkippedItems: { question: string; reason: string }[] = [];

  for (const item of itemsToInsert) {
    const cleanQ = item.question.trim();
    const cleanA = item.correctAnswer.trim();
    const source = (item.sourceFile || 'manual_upload').trim();

    try {
      const inserted = await sql`
        INSERT INTO questions (question, correct_answer, source_file)
        VALUES (${cleanQ}, ${cleanA}, ${source})
        ON CONFLICT (lower(trim(question))) DO NOTHING
        RETURNING lower(trim(question)) as norm_q;
      `;

      if (inserted.length > 0) {
        insertedCount++;
      } else {
        skippedDbCount++;
        dbSkippedItems.push({
          question: cleanQ,
          reason: 'Ya existía previamente en la Base de Datos'
        });
      }
    } catch (err: any) {
      if (err.code === '23505') {
        skippedDbCount++;
        dbSkippedItems.push({
          question: cleanQ,
          reason: 'Ya existía previamente en la Base de Datos'
        });
      } else {
        throw err;
      }
    }
  }

  const skippedCount = inBatchDuplicates.length + skippedDbCount;
  const allSkipped = [...inBatchDuplicates, ...dbSkippedItems];

  const countResult = await sql`SELECT count(*)::int as total FROM questions;`;
  const totalInDb = Number(countResult[0]?.total || 0);

  return {
    insertedCount,
    skippedCount,
    totalInDb,
    skippedItems: allSkipped
  };
}

export async function getAllQuestionsFromDb(): Promise<QuestionInput[]> {
  await initDb();
  const sql = getSql();
  const rows = await sql`
    SELECT question, correct_answer as "correctAnswer", source_file as "sourceFile" 
    FROM questions 
    ORDER BY id ASC;
  `;
  return rows.map(r => ({
    question: r.question as string,
    correctAnswer: r.correctAnswer as string,
    sourceFile: (r.sourceFile as string) || 'Neon DB'
  }));
}

export async function getDbStats() {
  await initDb();
  const sql = getSql();
  const countResult = await sql`SELECT count(*)::int as total FROM questions;`;
  return {
    totalInDb: Number(countResult[0]?.total || 0)
  };
}
