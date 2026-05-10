import { test } from 'node:test';
import assert from 'node:assert';
import { getRootDomain, cleanText } from './parse.js';

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

test('cleanText - handles normal strings', () => {
    const input = { title: 'Normal Title', desc: 'Normal Description' };
    const expected = { title: 'Normal Title', desc: 'Normal Description' };
    assert.deepStrictEqual(cleanText(input), expected);
});

test('cleanText - handles missing/undefined properties', () => {
    const input = {};
    const expected = { title: '', desc: '' };
    assert.deepStrictEqual(cleanText(input), expected);

    const input2 = { title: null, desc: undefined };
    assert.deepStrictEqual(cleanText(input2), expected);
});

test('cleanText - strips newlines, carriage returns, and tabs', () => {
    const input = { title: 'Title\nWith\rNewlines\tand\ttabs', desc: 'Desc\nWith\rNewlines\tand\ttabs' };
    const expected = { title: 'Title With Newlines and tabs', desc: 'Desc With Newlines and tabs' };
    assert.deepStrictEqual(cleanText(input), expected);
});

test('cleanText - reduces multiple consecutive spaces to a single space', () => {
    const input = { title: 'Title  with   multiple    spaces', desc: 'Desc  with   multiple    spaces' };
    const expected = { title: 'Title with multiple spaces', desc: 'Desc with multiple spaces' };
    assert.deepStrictEqual(cleanText(input), expected);
});

test('cleanText - trims leading and trailing whitespace', () => {
    const input = { title: '  Title with whitespace  ', desc: '  Desc with whitespace  ' };
    const expected = { title: 'Title with whitespace', desc: 'Desc with whitespace' };
    assert.deepStrictEqual(cleanText(input), expected);
});

test('cleanText - handles combined formatting issues', () => {
    const input = {
        title: ' \n  Title \t with \r\n multiple \n\n issues  \t ',
        desc: ' \n  Desc \t with \r\n multiple \n\n issues  \t '
    };
    const expected = {
        title: 'Title with multiple issues',
        desc: 'Desc with multiple issues'
    };
    assert.deepStrictEqual(cleanText(input), expected);
});
