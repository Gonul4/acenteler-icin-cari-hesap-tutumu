const { test } = require('node:test');
const assert = require('node:assert/strict');
const argon2 = require('argon2');
process.env.JWT_SECRET = 'account-settings-test-secret-1234567890';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
const User = require('../models/User');
const app = require('../server');
test('self credential change requires current password, preserves identity and revokes old sessions', async () => {
  const original = { findById: User.findById, findOne: User.findOne, update: User.findOneAndUpdate };
  const account = { _id: '507f1f77bcf86cd799439001', name: 'Test Muhasebe', username: 'oldadmin', role: 'admin', active: true, authVersion: 0, passwordHash: await argon2.hash('old-test-password') };
  User.findById = () => ({ select: async () => ({ ...account }) });
  User.findOne = q => ({ select: async () => q.username === account.username ? { ...account } : null });
  let writes = 0;
  User.findOneAndUpdate = async (q, u) => {
    if (u.$set.username === 'taken') throw { code: 11000 };
    if (q._id !== account._id || q.passwordHash !== account.passwordHash) return null;
    Object.assign(account, u.$set); account.authVersion++; writes++; return { ...account };
  };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';
  const call = async (path, data, method='POST') => {
    const response = await fetch(base+path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(cookie ? {Cookie:cookie}: {}) }, ...(data ? {body:JSON.stringify(data)} : {}) });
    return { status: response.status, data: await response.json(), cookie:response.headers.get('set-cookie') };
  };
  try {
    const payload = { username:'admin', currentPassword:'old-test-password', newPassword:'new-test-8', role:'staff', userId:'another-user' };
    assert.equal((await call('/auth/account',payload)).status,401);
    const login=await call('/auth/login',{username:'oldadmin',password:'old-test-password'});
    cookie=login.cookie.split(';')[0]; const oldCookie=cookie;
    assert.equal((await call('/auth/account',{...payload,newPassword:'short'})).status,400);
    assert.equal((await call('/auth/account',{...payload,currentPassword:'wrong'})).status,400);
    assert.equal(writes,0);
    assert.equal((await call('/auth/account',{...payload,username:'taken'})).status,409);
    const changed=await call('/auth/account',payload);
    assert.equal(changed.status,200);
    assert.ok(!JSON.stringify(changed.data).includes('passwordHash'));
    assert.match(changed.cookie,/Expires=Thu, 01 Jan 1970/);
    assert.equal(account.username,'admin'); assert.equal(account.role,'admin');
    assert.equal(account._id,'507f1f77bcf86cd799439001');
    assert.ok(await argon2.verify(account.passwordHash,'new-test-8'));
    assert.equal((await call('/auth/me',null,'GET')).status,401);
    assert.equal((await call('/auth/login',{username:'oldadmin',password:'old-test-password'})).status,401);
    const next=await call('/auth/login',{username:'admin',password:'new-test-8'});
    assert.equal(next.status,200); cookie=next.cookie.split(';')[0];
    assert.equal((await call('/auth/me',null,'GET')).status,200);
    cookie=oldCookie; assert.equal((await call('/auth/account',payload)).status,401);
  } finally { User.findById=original.findById; User.findOne=original.findOne; User.findOneAndUpdate=original.update; await new Promise(r => server.close(r)); }
});
