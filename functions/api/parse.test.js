import { test } from 'node:test';
import assert from 'node:assert';
import { getRootDomain, getMandatoryWhiteList } from './_utils.js';

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

test('getMandatoryWhiteList - returns an object with entries', () => {
    const list = getMandatoryWhiteList();
    assert.ok(list && typeof list === 'object');
    assert.ok(Object.keys(list).length > 0);
});

test('getMandatoryWhiteList - contains specific domains with correct structure', () => {
    const list = getMandatoryWhiteList();

    // Check bilibili.com
    const bilibili = list['bilibili.com'];
    assert.ok(bilibili);
    assert.strictEqual(typeof bilibili.siteName, 'string');
    assert.strictEqual(typeof bilibili.siteDesc, 'string');
    assert.strictEqual(typeof bilibili.siteCategory, 'string');
    assert.strictEqual(bilibili.siteName, 'B站');

    // Check v2ex.com
    const v2ex = list['v2ex.com'];
    assert.ok(v2ex);
    assert.strictEqual(typeof v2ex.siteName, 'string');
    assert.strictEqual(typeof v2ex.siteDesc, 'string');
    assert.strictEqual(typeof v2ex.siteCategory, 'string');

    // Check taobao.com
    const taobao = list['taobao.com'];
    assert.ok(taobao);
    assert.strictEqual(typeof taobao.siteName, 'string');
    assert.strictEqual(typeof taobao.siteDesc, 'string');
    assert.strictEqual(typeof taobao.siteCategory, 'string');
});
