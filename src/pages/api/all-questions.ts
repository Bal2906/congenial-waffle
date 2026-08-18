import type { APIRoute } from 'astro';
import { getAllQuestionsFromDb } from '../../utils/db';

export const GET: APIRoute = async () => {
  try {
    const questions = await getAllQuestionsFromDb();
    return new Response(
      JSON.stringify({ success: true, count: questions.length, questions }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Error al obtener preguntas de la BD' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
