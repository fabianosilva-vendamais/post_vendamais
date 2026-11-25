import { handle, publishSchedule } from '../_lib/ai.js';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(req) { return handle(req, publishSchedule); }
export async function OPTIONS() { return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' } }); }
