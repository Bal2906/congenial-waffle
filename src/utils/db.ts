import postgres from 'postgres';

const connectionString = (typeof process !== 'undefined' && process.env.DATABASE_URL)
  ? process.env.DATABASE_URL
  : (import.meta.env.DATABASE_URL || '');

if (!connectionString) {
  console.warn('⚠️ ADVERTENCIA: No se encontró la variable DATABASE_URL en el archivo .env o en el entorno.');
}

// Initialize postgres client connection
export const sql = postgres(connectionString, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

// Helper to ensure database table & unique indexes exist
export async function initDb() {
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

  // Pre-deduplicate in Node.js RAM (O(N) time)
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
      totalInDb: countResult[0]?.total || 0,
      skippedItems: inBatchDuplicates
    };
  }

  // Bulk Insert in chunks of 500
  const CHUNK_SIZE = 500;
  let insertedCount = 0;
  let skippedDbCount = 0;
  const dbSkippedItems: { question: string; reason: string }[] = [];

  for (let i = 0; i < itemsToInsert.length; i += CHUNK_SIZE) {
    const chunk = itemsToInsert.slice(i, i + CHUNK_SIZE);

    const rows = chunk.map(q => ({
      question: q.question.trim(),
      correct_answer: q.correctAnswer.trim(),
      source_file: (q.sourceFile || 'manual_upload').trim()
    }));

    const inserted = await sql`
      INSERT INTO questions ${sql(rows, 'question', 'correct_answer', 'source_file')}
      ON CONFLICT (lower(trim(question))) DO NOTHING
      RETURNING lower(trim(question)) as norm_q;
    `;

    const insertedNormSet = new Set(inserted.map(r => r.norm_q));
    insertedCount += inserted.length;

    chunk.forEach(item => {
      const normKey = item.question.trim().toLowerCase();
      if (!insertedNormSet.has(normKey)) {
        skippedDbCount++;
        dbSkippedItems.push({
          question: item.question,
          reason: 'Ya existía previamente en la Base de Datos'
        });
      }
    });
  }

  const skippedCount = inBatchDuplicates.length + skippedDbCount;
  const allSkipped = [...inBatchDuplicates, ...dbSkippedItems];

  const countResult = await sql`SELECT count(*)::int as total FROM questions;`;
  const totalInDb = countResult[0]?.total || 0;

  return {
    insertedCount,
    skippedCount,
    totalInDb,
    skippedItems: allSkipped
  };
}

export async function getAllQuestionsFromDb(): Promise<QuestionInput[]> {
  await initDb();
  const rows = await sql`
    SELECT question, correct_answer as "correctAnswer", source_file as "sourceFile" 
    FROM questions 
    ORDER BY id ASC;
  `;
  return rows.map(r => ({
    question: r.question,
    correctAnswer: r.correctAnswer,
    sourceFile: r.sourceFile || 'Neon DB'
  }));
}

export async function getDbStats() {
  await initDb();
  const countResult = await sql`SELECT count(*)::int as total FROM questions;`;
  return {
    totalInDb: countResult[0]?.total || 0
  };
}
