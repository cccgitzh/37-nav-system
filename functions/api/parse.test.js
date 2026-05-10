import { test } from 'node:test';
import assert from 'node:assert';
import { getRootDomain, getPerfectPrompt } from './parse.js';

test('getPerfectPrompt - happy path with valid description', () => {
    const meta = { title: 'Test Title', desc: 'This is a valid long description' };
    const url = 'https://example.com';
    const result = getPerfectPrompt(meta, url, false);

    assert.ok(result.includes('标题: Test Title'));
    assert.ok(result.includes('描述: This is a valid long description'));
    assert.ok(result.includes('网址: https://example.com'));
    assert.ok(result.includes('是否缺乏有效描述信息: false'));
});

test('getPerfectPrompt - with isInvalid true', () => {
    const meta = { title: 'Test Title', desc: 'This is a valid long description' };
    const url = 'https://example.com';
    const result = getPerfectPrompt(meta, url, true);

    assert.ok(result.includes('是否缺乏有效描述信息: true'));
});

test('getPerfectPrompt - with missing description', () => {
    const meta = { title: 'Test Title' };
    const url = 'https://example.com';
    const result = getPerfectPrompt(meta, url, false);

    assert.ok(result.includes('描述: undefined'));
    assert.ok(result.includes('是否缺乏有效描述信息: true'));
});

test('getPerfectPrompt - with short description', () => {
    const meta = { title: 'Test Title', desc: '1234' };
    const url = 'https://example.com';
    const result = getPerfectPrompt(meta, url, false);

    assert.ok(result.includes('描述: 1234'));
    assert.ok(result.includes('是否缺乏有效描述信息: true'));
});

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
