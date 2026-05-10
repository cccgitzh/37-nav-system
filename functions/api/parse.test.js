import { test } from 'node:test';
import assert from 'node:assert';
import { getRootDomain, extractDomain } from './parse.js';

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

test('extractDomain - valid URLs with protocol', () => {
    assert.strictEqual(extractDomain('https://example.com'), 'example.com');
    assert.strictEqual(extractDomain('http://example.com/path/to/page?query=1'), 'example.com');
    assert.strictEqual(extractDomain('https://sub.example.com/'), 'sub.example.com');
});

test('extractDomain - URLs missing protocol', () => {
    assert.strictEqual(extractDomain('example.com'), 'example.com');
    assert.strictEqual(extractDomain('www.example.com/path'), 'www.example.com');
});

test('extractDomain - invalid/empty inputs', () => {
    assert.strictEqual(extractDomain(''), '');
    assert.strictEqual(extractDomain(null), '');
    assert.strictEqual(extractDomain(undefined), '');
    assert.strictEqual(extractDomain('not a url'), '');
});

test('extractDomain - edge cases', () => {
    assert.strictEqual(extractDomain('localhost'), 'localhost');
    assert.strictEqual(extractDomain('127.0.0.1'), '127.0.0.1');
    assert.strictEqual(extractDomain('http://localhost:8080'), 'localhost');
});
