import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'; import { getFunctions, httpsCallable } from 'firebase/functions'; import { requireAdminClaim, validateAdminAction } from './admin-policy.js';
export class AdminService { constructor({ app, auth, firestore }) { this.auth = auth; this.firestore = firestore; this.functions = getFunctions(app); }
  async assertAdmin() { const token = await this.auth.currentUser.getIdTokenResult(true); return requireAdminClaim(token.claims); }
  async listUsers() { await this.assertAdmin(); const snapshot = await getDocs(query(collection(this.firestore, 'users'), orderBy('createdAt', 'desc'), limit(250))); return snapshot.docs.map((item) => item.data()); }
  async updateUser(input) { await this.assertAdmin(); validateAdminAction(input); return (await httpsCallable(this.functions, 'adminUpdateUser')(input)).data; }
}
