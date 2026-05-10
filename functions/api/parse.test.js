import { test } from 'node:test';
import assert from 'node:assert';
import { getRootDomain } from './parse.js';

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
