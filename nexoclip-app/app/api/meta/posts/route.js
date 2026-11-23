import { instagramHandler } from '../../../../src/services/instagramRoutes.mjs';
export const runtime='nodejs';
export const GET=instagramHandler('posts');
