import type { APIRoute } from 'astro';
import { saveQuestionsToDb, type QuestionInput } from '../../utils/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const questions: QuestionInput[] = body.questions;

    if (!Array.isArray(questions) || questions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se enviaron preguntas válidas' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await saveQuestionsToDb(questions);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Proceso completado. ${result.insertedCount} guardadas, ${result.skippedCount} duplicadas omitidas.`,
        ...result
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('🔥 Error en API /api/save-questions:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Error al conectar o guardar en la Base de Datos' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
