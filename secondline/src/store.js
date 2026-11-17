'use strict';
// Tiny JSON-file store. One file, atomic writes. Plenty for dozens of shops;
// swap for Postgres when there are hundreds.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMPTY = () => ({ businesses: {}, calls: {}, bookings: {}, outbox: [], leads: {}, suppressed: {} });

class Store {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    this.timer = null;
    if (file && fs.existsSync(file)) {
      try { this.data = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) {
        console.error('[store] could not read data file, starting empty:', e.message);
      }
    }
  }

  save() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 50);
  }

  flush() {
    if (!this.file) return;
    clearTimeout(this.timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }

  // Businesses
  addBusiness(biz) {
    biz.id = biz.id || id('biz');
    biz.token = biz.token || secret();
    biz.calToken = biz.calToken || secret();
    biz.createdAt = biz.createdAt || new Date().toISOString();
    this.data.businesses[biz.id] = biz;
    this.save();
    return biz;
  }
  business(id) { return this.data.businesses[id] || null; }
  businessByToken(token) {
    if (!token) return null;
    return Object.values(this.data.businesses).find((b) => safeEq(b.token, token)) || null;
  }
  businessByCalToken(token) {
    return Object.values(this.data.businesses).find((b) => safeEq(b.calToken, token)) || null;
  }
  businessByNumber(num) {
    const n = digits(num);
    return Object.values(this.data.businesses).find((b) => b.lineNumber && digits(b.lineNumber) === n) || null;
  }
  businessesByOwnerPhone(num) {
    const n = digits(num);
    return Object.values(this.data.businesses).filter((b) => digits(b.ownerPhone) === n);
  }
  updateBusiness(id, patch) {
    const b = this.data.businesses[id];
    if (!b) return null;
    Object.assign(b, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return b;
  }

  // Calls (a call or text conversation handled by the receptionist)
  putCall(call) { this.data.calls[call.id] = call; this.save(); return call; }
  call(id) { return this.data.calls[id] || null; }
  callsFor(bizId) {
    return Object.values(this.data.calls)
      .filter((c) => c.businessId === bizId)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }
  openTextThread(bizId, phone, maxAgeMs = 24 * 3600000) {
    const n = digits(phone);
    return Object.values(this.data.calls).find((c) => c.businessId === bizId && c.channel === 'sms'
      && !c.endedAt && digits(c.callerPhone) === n && Date.now() - new Date(c.startedAt) < maxAgeMs) || null;
  }

  // Bookings
  addBooking(b) {
    b.id = b.id || id('job');
    b.createdAt = new Date().toISOString();
    b.status = b.status || 'booked';
    this.data.bookings[b.id] = b;
    this.save();
    return b;
  }
  bookings(bizId) {
    return Object.values(this.data.bookings).filter((b) => !bizId || b.businessId === bizId);
  }

  // Every outgoing text is logged, sent or not, so nothing is ever silent.
  logText(msg) {
    this.data.outbox.push(msg);
    if (this.data.outbox.length > 2000) this.data.outbox.splice(0, this.data.outbox.length - 2000);
    this.save();
  }
}

function id(prefix) { return `${prefix}_${crypto.randomBytes(6).toString('hex')}`; }
function secret() { return crypto.randomBytes(18).toString('base64url'); }
function digits(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length === 11 && d[0] === '1' ? d.slice(1) : d;
}
function safeEq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

module.exports = { Store, id, secret, digits };
