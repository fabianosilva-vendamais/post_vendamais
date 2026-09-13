// A aplicação (Design Component) roda como página estática em /public; esta rota só redireciona.
import { redirect } from 'next/navigation';
export default function Home() { redirect('/app/'); }
