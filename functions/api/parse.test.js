import { test } from 'node:test';
import assert from 'node:assert';
import { getRootDomain, forceValidate } from './parse.js';

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

// forceValidate edge case tests
test('forceValidate - valid JSON parsing', () => {
    const aiRes = { response: '{ "siteName": "A", "siteDesc": "B", "siteCategory": "生活" }' };
    const result = forceValidate(aiRes, 'example.com');
    assert.deepStrictEqual(result, { siteName: "A", siteDesc: "B", siteCategory: "生活" });
});

test('forceValidate - extraneous text (markdown)', () => {
    const aiRes = { response: '```json\n{ "siteName": "A", "siteDesc": "B", "siteCategory": "购物" }\n```' };
    const result = forceValidate(aiRes, 'example.com');
    assert.deepStrictEqual(result, { siteName: "A", siteDesc: "B", siteCategory: "购物" });
});

test('forceValidate - trailing garbage', () => {
    const aiRes = { response: '{ "siteName": "A", "siteDesc": "B", "siteCategory": "论坛" } trailing garbage' };
    const result = forceValidate(aiRes, 'example.com');
    assert.deepStrictEqual(result, { siteName: "A", siteDesc: "B", siteCategory: "论坛" });
});

test('forceValidate - fallback values (missing data)', () => {
    const aiRes = { response: '{ "siteName": "", "siteDesc": "暂无简介" }' };
    const result = forceValidate(aiRes, 'example.com');
    assert.deepStrictEqual(result, { siteName: "Example", siteDesc: "访问 Example 的官方站点", siteCategory: "探索基地" });
});

test('forceValidate - prefix removal', () => {
    const aiRes = { response: '{ "siteName": "A", "siteDesc": "这是一个测试网站", "siteCategory": "知识" }' };
    const result = forceValidate(aiRes, 'example.com');
    assert.deepStrictEqual(result, { siteName: "A", siteDesc: "测试网站", siteCategory: "知识" });

    const aiRes2 = { response: '{ "siteName": "A", "siteDesc": "这是一款测试工具", "siteCategory": "技术" }' };
    const result2 = forceValidate(aiRes2, 'example.com');
    assert.deepStrictEqual(result2, { siteName: "A", siteDesc: "测试工具", siteCategory: "技术" });
});

test('forceValidate - missing JSON/invalid format', () => {
    const aiRes = { response: 'invalid text without json' };
    const result = forceValidate(aiRes, 'example.com');
    assert.deepStrictEqual(result, { siteName: "Example", siteDesc: "访问 Example 的官方站点", siteCategory: "探索基地" });

    const aiResEmpty = {};
    const resultEmpty = forceValidate(aiResEmpty, 'example.com');
    assert.deepStrictEqual(resultEmpty, { siteName: "Example", siteDesc: "访问 Example 的官方站点", siteCategory: "探索基地" });
});
