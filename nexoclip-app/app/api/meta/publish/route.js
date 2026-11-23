import { instagramHandler } from '../../../../src/services/instagramRoutes.mjs';
export const runtime='nodejs';
export const GET=instagramHandler('publish');
export const POST=instagramHandler('publish');
