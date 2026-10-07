import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '../src/lib/auth/session.js';
import { getCurrentSession } from '../src/services/authService.js';
import { isPlatformOperator } from '../src/services/economicsService.js';
import BackofficeDashboard from './BackofficeDashboard';
export default async function BackofficePage({mode}) {
 const session=await getCurrentSession((await cookies()).get(SESSION_COOKIE)?.value);
 if(!session)redirect('/login');
 if(!isPlatformOperator(session.user_id))redirect('/studio');
 return <BackofficeDashboard mode={mode}/>;
}
