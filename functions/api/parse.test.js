import { test } from 'node:test';
import assert from 'node:assert';
import { getRootDomain, guessPerfectName } from './parse.js';

test('getRootDomain - empty/null/undefined', () => {
    assert.strictEqual(getRootDomain(''), '');
    assert.strictEqual(getRootDomain(null), '');
    assert.strictEqual(getRootDomain(undefined), '');
});

test('getRootDomain - single level domain', () => {
    assert.strictEqual(getRootDomain('localhost'), 'localhost');
});

test('getRootDomain - standard domain', () => {
    assert.strictEqual(getRootDomain('example.com'), 'example.com');
});

test('getRootDomain - subdomain', () => {
    assert.strictEqual(getRootDomain('www.example.com'), 'example.com');
    assert.strictEqual(getRootDomain('sub.example.com'), 'example.com');
});

test('getRootDomain - multi-level subdomain', () => {
    assert.strictEqual(getRootDomain('a.b.c.example.com'), 'example.com');
});

test('getRootDomain - with numbers', () => {
    assert.strictEqual(getRootDomain('127.0.0.1'), '0.1'); // Current logic: splits by '.' and takes last two.
});

test('guessPerfectName - empty/null/undefined', () => {
    assert.strictEqual(guessPerfectName(''), '未知站点');
    assert.strictEqual(guessPerfectName(null), '未知站点');
    assert.strictEqual(guessPerfectName(undefined), '未知站点');
});

test('guessPerfectName - standard domain', () => {
    assert.strictEqual(guessPerfectName('example.com'), 'Example');
    assert.strictEqual(guessPerfectName('github.com'), 'Github');
});

test('guessPerfectName - excluded prefixes', () => {
    assert.strictEqual(guessPerfectName('www.example.com'), 'Example');
    assert.strictEqual(guessPerfectName('m.example.com'), 'Example');
    assert.strictEqual(guessPerfectName('mobile.example.com'), 'Example');
    assert.strictEqual(guessPerfectName('mail.example.com'), 'Example');
});

test('guessPerfectName - subdomain', () => {
    assert.strictEqual(guessPerfectName('sub.example.com'), 'Sub Example');
    assert.strictEqual(guessPerfectName('api.github.com'), 'Api Github');
});

test('guessPerfectName - complex TLDs / multiple segments', () => {
    assert.strictEqual(guessPerfectName('example.co.uk'), 'Example Co Uk');
    assert.strictEqual(guessPerfectName('sub.example.co.uk'), 'Sub Example Co Uk');
    assert.strictEqual(guessPerfectName('a.b.c.com'), 'A B C');
});
