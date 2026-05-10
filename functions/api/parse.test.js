import { test } from 'node:test';
import assert from 'node:assert';


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

test('extractDomain - valid URLs with protocols', () => {
    assert.strictEqual(extractDomain('https://example.com'), 'example.com');
    assert.strictEqual(extractDomain('http://example.com'), 'example.com');
});

test('extractDomain - URLs without protocols', () => {
    assert.strictEqual(extractDomain('example.com'), 'example.com');
    assert.strictEqual(extractDomain('sub.example.com'), 'sub.example.com');
});

test('extractDomain - URLs with paths and query parameters', () => {
    assert.strictEqual(extractDomain('https://example.com/path/to/page?query=1'), 'example.com');
    assert.strictEqual(extractDomain('example.com/path?q=1'), 'example.com');
});

test('extractDomain - URLs with ports', () => {
    assert.strictEqual(extractDomain('https://example.com:8080'), 'example.com');
    assert.strictEqual(extractDomain('example.com:8080'), 'example.com');
    assert.strictEqual(extractDomain('localhost:3000'), 'localhost');
});

test('extractDomain - empty/null/undefined', () => {
    assert.strictEqual(extractDomain(''), '');
    assert.strictEqual(extractDomain(null), '');
    assert.strictEqual(extractDomain(undefined), '');
});

test('extractDomain - invalid strings', () => {
    assert.strictEqual(extractDomain('invalid url //++'), '');
});
